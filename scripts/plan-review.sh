#!/usr/bin/env bash

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(node -e "try { const d=JSON.parse(process.argv[1]); process.stdout.write(d.toolName || ''); } catch (e) {}" -- "$INPUT" 2>/dev/null || echo "")

echo "plancop: preToolUse toolName=$TOOL_NAME" >&2

PLANCOP_MODE="${PLANCOP_MODE:-auto}"
if [ "$PLANCOP_MODE" = "off" ]; then
  echo "plancop: mode=off, passing through" >&2
  exit 0
fi

INTERCEPT_TOOLS="edit create write"
if [ "$PLANCOP_MODE" = "aggressive" ]; then
  INTERCEPT_TOOLS="edit create write bash"
fi

if [ "$PLANCOP_MODE" = "always" ]; then
  SHOULD_INTERCEPT=1
else
  SHOULD_INTERCEPT=0
  for TOOL in $INTERCEPT_TOOLS; do
    if [ "$TOOL_NAME" = "$TOOL" ]; then
      SHOULD_INTERCEPT=1
      break
    fi
  done
fi

if [ "$SHOULD_INTERCEPT" = "0" ]; then
  echo "plancop: $TOOL_NAME not in intercept list, passing through" >&2
  exit 0
fi

SESSION_MODE="${PLANCOP_SESSION_MODE:-persistent}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_SCRIPT="$REPO_DIR/server/index.ts"

if [ ! -f "$SERVER_SCRIPT" ]; then
  echo "plancop: WARNING: server script not found at $SERVER_SCRIPT" >&2
  exit 0
fi

if ! command -v npx &>/dev/null; then
  echo "plancop: WARNING: npx not found, cannot launch review server" >&2
  exit 0
fi

open_browser() {
  local url="$1"
  echo "plancop: Review UI at $url" >&2
  if command -v xdg-open &>/dev/null; then
    xdg-open "$url" &>/dev/null &
  elif command -v open &>/dev/null; then
    open "$url" &>/dev/null &
  else
    echo "plancop: Open this URL manually: $url" >&2
  fi
}

wait_for_port() {
  local stderr_file="$1"
  local server_pid="$2"
  local port=""

  for i in $(seq 1 100); do
    port=$(grep -o 'PLANCOP_PORT:[0-9]*' "$stderr_file" 2>/dev/null | head -1 | cut -d: -f2 || true)
    if [ -n "$port" ]; then
      printf '%s' "$port"
      return 0
    fi

    if ! kill -0 "$server_pid" 2>/dev/null; then
      return 1
    fi
    sleep 0.1
  done

  return 1
}

if [ "$SESSION_MODE" = "ephemeral" ]; then
  export PLAN_INPUT="$INPUT"
  export PLANCOP_SESSION_MODE="ephemeral"

  DECISION_FILE=$(mktemp /tmp/plancop-decision-XXXXXX.json)
  STDERR_FILE=$(mktemp /tmp/plancop-stderr-XXXXXX.log)
  trap 'rm -f "$DECISION_FILE" "$STDERR_FILE"' EXIT

  npx tsx "$SERVER_SCRIPT" > "$DECISION_FILE" 2> "$STDERR_FILE" &
  SERVER_PID=$!

  if ! PORT=$(wait_for_port "$STDERR_FILE" "$SERVER_PID"); then
    echo "plancop: WARNING: server failed to start" >&2
    cat "$STDERR_FILE" >&2 2>/dev/null || true
    exit 0
  fi

  open_browser "http://127.0.0.1:$PORT"
  wait "$SERVER_PID" 2>/dev/null || true

  if [ -f "$DECISION_FILE" ] && [ -s "$DECISION_FILE" ]; then
    cat "$DECISION_FILE"
  else
    echo "plancop: No decision received, allowing (fail-open)" >&2
  fi
  exit 0
fi

PID_FILE="$HOME/.plancop/server.pid"
PORT=""
REUSED=0
STDERR_FILE=$(mktemp /tmp/plancop-persistent-stderr-XXXXXX.log)
STDOUT_FILE=$(mktemp /tmp/plancop-persistent-stdout-XXXXXX.log)
trap 'rm -f "$STDERR_FILE" "$STDOUT_FILE"' EXIT

if [ -f "$PID_FILE" ]; then
  PID_INFO=$(node -e "const fs=require('node:fs'); try { const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (Number.isInteger(d.pid) && Number.isInteger(d.port)) process.stdout.write(String(d.pid)+' '+String(d.port)); } catch (e) {}" -- "$PID_FILE" 2>/dev/null || true)
  EXISTING_PID="${PID_INFO%% *}"
  EXISTING_PORT="${PID_INFO##* }"

  if [ -n "$EXISTING_PID" ] && [ -n "$EXISTING_PORT" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    if curl -fsS "http://127.0.0.1:$EXISTING_PORT/api/status" >/dev/null 2>&1; then
      PORT="$EXISTING_PORT"
      REUSED=1
      echo "plancop: reusing server on port $PORT" >&2
    else
      rm -f "$PID_FILE"
    fi
  else
    rm -f "$PID_FILE"
  fi
fi

if [ "$REUSED" = "0" ]; then
  export PLAN_INPUT="$INPUT"
  export PLANCOP_SESSION_MODE="persistent"

  npx tsx "$SERVER_SCRIPT" > "$STDOUT_FILE" 2> "$STDERR_FILE" &
  SERVER_PID=$!

  if ! PORT=$(wait_for_port "$STDERR_FILE" "$SERVER_PID"); then
    echo "plancop: WARNING: server failed to start" >&2
    cat "$STDERR_FILE" >&2 2>/dev/null || true
    exit 0
  fi

  open_browser "http://127.0.0.1:$PORT"
fi

DECISION=$(curl -sS -X POST "http://127.0.0.1:$PORT/api/push-plan" \
  -H "Content-Type: application/json" \
  --data "$INPUT" || true)

if node -e "try { const d=JSON.parse(process.argv[1]); if (d.permissionDecision === 'allow' || (d.permissionDecision === 'deny' && typeof d.permissionDecisionReason === 'string')) process.exit(0); } catch (e) {} process.exit(1);" -- "$DECISION"; then
  printf '%s\n' "$DECISION"
else
  echo "plancop: invalid decision from persistent server, allowing (fail-open)" >&2
fi
