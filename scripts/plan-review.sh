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

# Use pinned port for testing, otherwise random (server uses listen(0))
if [ -n "${PLANCOP_PORT:-}" ]; then
  export PLANCOP_PORT
fi

# Temp file for server decision output
DECISION_FILE=$(mktemp /tmp/plancop-decision-XXXXXX.json)

# Cleanup on exit
trap 'rm -f "$DECISION_FILE"' EXIT

# Determine script directory for relative server path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PATH="$SCRIPT_DIR/../server/index.js"

# Check if server exists
if [ ! -f "$SERVER_PATH" ]; then
  echo "plancop: WARNING: server not built yet at $SERVER_PATH" >&2
  echo "plancop: Run 'npm install && npm run build' to build the server" >&2
  # Fail open — allow the tool to proceed
  exit 0
fi

# Launch server, capture its decision JSON output
# Server writes decision JSON to DECISION_FILE and port to stderr
DECISION_TMPFILE="$DECISION_FILE" node "$SERVER_PATH" 2>&1 | while IFS= read -r line; do
  # Extract port from server output "PLANCOP_PORT:XXXX"
  if [[ "$line" =~ ^PLANCOP_PORT:([0-9]+)$ ]]; then
    PORT="${BASH_REMATCH[1]}"
    # Open browser
    URL="http://127.0.0.1:$PORT"
    echo "plancop: Review UI at $URL" >&2
    if command -v xdg-open &>/dev/null; then
      xdg-open "$URL" &>/dev/null &
    elif command -v open &>/dev/null; then
      open "$URL" &>/dev/null &
    else
      echo "plancop: Open this URL manually: $URL" >&2
    fi
  else
    echo "plancop[server]: $line" >&2
  fi
done

# Read decision from temp file
if [ -f "$DECISION_FILE" ] && [ -s "$DECISION_FILE" ]; then
  cat "$DECISION_FILE"
else
  # Fail open if server didn't produce a decision
  echo "plancop: No decision received, allowing (fail-open)" >&2
fi
