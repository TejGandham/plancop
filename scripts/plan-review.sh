#!/usr/bin/env bash
# Plancop plan-review.sh — preToolUse hook for Copilot CLI
# 
# Reads the preToolUse stdin JSON, filters by toolName,
# and launches the Node.js review server for relevant tools.
#
# Copilot CLI API:
#   stdin: {"timestamp":N,"cwd":"/path","toolName":"edit","toolArgs":"{...}"}
#   stdout: {"permissionDecision":"allow"} or {"permissionDecision":"deny","permissionDecisionReason":"..."}
#   Only "deny" is processed — exit 0 with no stdout = allow
#   stderr is safe for logging

set -euo pipefail

# Read all stdin into variable (Copilot CLI sends once at hook invocation)
INPUT=$(cat)

# Parse toolName using Node.js (no jq dependency)
TOOL_NAME=$(node -e "try { const d=JSON.parse(process.argv[1]); process.stdout.write(d.toolName || ''); } catch(e) { }" -- "$INPUT" 2>/dev/null || echo "")

# Log to stderr (safe — not parsed by Copilot CLI)
echo "plancop: preToolUse toolName=$TOOL_NAME" >&2

# Check PLANCOP_MODE (default: auto)
PLANCOP_MODE="${PLANCOP_MODE:-auto}"
if [ "$PLANCOP_MODE" = "off" ]; then
  echo "plancop: mode=off, passing through" >&2
  exit 0
fi

# Default intercept list (overridden by PLANCOP_MODE or config in future tasks)
INTERCEPT_TOOLS="edit create write"

# Aggressive mode: also intercept bash
if [ "$PLANCOP_MODE" = "aggressive" ]; then
  INTERCEPT_TOOLS="edit create write bash"
fi

# Always mode: intercept everything
if [ "$PLANCOP_MODE" = "always" ]; then
  # Signal to intercept all tools
  SHOULD_INTERCEPT=1
else
  # Check if this tool is in the intercept list
  SHOULD_INTERCEPT=0
  for TOOL in $INTERCEPT_TOOLS; do
    if [ "$TOOL_NAME" = "$TOOL" ]; then
      SHOULD_INTERCEPT=1
      break
    fi
  done
fi

# Pass through non-intercepted tools instantly
if [ "$SHOULD_INTERCEPT" = "0" ]; then
  echo "plancop: $TOOL_NAME not in intercept list, passing through" >&2
  exit 0
fi

echo "plancop: intercepting $TOOL_NAME, launching review server..." >&2

# Pass plan data to server via environment variable
# (Server reads this instead of stdin since stdin is already consumed)
export PLAN_INPUT="$INPUT"

# Bridge PLANCOP_PORT → server env (server also checks PLANCOP_PORT directly)
if [ -n "${PLANCOP_PORT:-}" ]; then
  export PLANCOP_PORT
fi

# Temp files for capturing server output
DECISION_FILE=$(mktemp /tmp/plancop-decision-XXXXXX.json)
STDERR_FILE=$(mktemp /tmp/plancop-stderr-XXXXXX.log)

# Cleanup on exit (always, even on error)
trap 'rm -f "$DECISION_FILE" "$STDERR_FILE"' EXIT

# Determine script directory for relative server path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_SCRIPT="$SCRIPT_DIR/plancop-server.ts"

# Check if server script exists
if [ ! -f "$SERVER_SCRIPT" ]; then
  echo "plancop: WARNING: server script not found at $SERVER_SCRIPT" >&2
  echo "plancop: Ensure plancop is properly installed" >&2
  # Fail open — allow the tool to proceed
  exit 0
fi

# Check if npx/tsx is available
if ! command -v npx &>/dev/null; then
  echo "plancop: WARNING: npx not found, cannot launch review server" >&2
  exit 0
fi

# Launch server in background:
#   stdout → DECISION_FILE (captures decision JSON only)
#   stderr → STDERR_FILE  (captures PLANCOP_PORT:XXXX and debug output)
npx tsx "$SERVER_SCRIPT" > "$DECISION_FILE" 2> "$STDERR_FILE" &
SERVER_PID=$!

# Wait for server to emit PLANCOP_PORT:XXXX on stderr (up to 100 × 0.1s = 10s)
# tsx cold-start can take 3-5s on first run
PORT=""
for i in $(seq 1 100); do
  PORT=$(grep -o 'PLANCOP_PORT:[0-9]*' "$STDERR_FILE" 2>/dev/null | head -1 | cut -d: -f2 || true)
  [ -n "$PORT" ] && break
  # Check if server already exited (error)
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "plancop: WARNING: server exited unexpectedly" >&2
    cat "$STDERR_FILE" >&2 2>/dev/null
    # Fail open
    exit 0
  fi
  sleep 0.1
done

if [ -z "$PORT" ]; then
  echo "plancop: WARNING: could not detect server port (timeout)" >&2
  cat "$STDERR_FILE" >&2 2>/dev/null
  kill "$SERVER_PID" 2>/dev/null || true
  # Fail open
  exit 0
fi

# Open browser (or print URL if no display)
URL="http://127.0.0.1:$PORT"
echo "plancop: Review UI at $URL" >&2
if command -v xdg-open &>/dev/null; then
  xdg-open "$URL" &>/dev/null &
elif command -v open &>/dev/null; then
  open "$URL" &>/dev/null &
else
  echo "plancop: Open this URL manually: $URL" >&2
fi

# Wait for server to finish (it exits after approve/deny)
wait "$SERVER_PID" 2>/dev/null || true

# Relay any non-port stderr to our stderr for debugging
grep -v '^PLANCOP_PORT:' "$STDERR_FILE" 2>/dev/null | while IFS= read -r line; do
  echo "plancop[server]: $line" >&2
done || true

# Output decision to stdout (this is what Copilot CLI reads)
if [ -f "$DECISION_FILE" ] && [ -s "$DECISION_FILE" ]; then
  cat "$DECISION_FILE"
else
  # Fail open if server didn't produce a decision
  echo "plancop: No decision received, allowing (fail-open)" >&2
fi
