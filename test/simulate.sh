#!/usr/bin/env bash
# Plancop test simulation harness
# Generates mock Copilot CLI preToolUse hook stdin JSON
#
# Usage:
#   bash test/simulate.sh edit          — pipe to plan-review.sh
#   bash test/simulate.sh create        — pipe to plan-review.sh
#   bash test/simulate.sh edit --dry-run  — output JSON only (don't pipe)
#   bash test/simulate.sh read          — test passthrough

set -euo pipefail

TOOL_NAME="${1:-edit}"
DRY_RUN=0
if [ "${2:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"

# Build tool args based on tool type
case "$TOOL_NAME" in
  edit)
    # Read fixture and double-encode as JSON string
    TOOL_ARGS=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync('$FIXTURES_DIR/edit-args.json','utf8'))))")
    ;;
  create)
    TOOL_ARGS=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync('$FIXTURES_DIR/create-args.json','utf8'))))")
    ;;
  read|ls|view|bash)
    # Simple passthrough tools
    TOOL_ARGS=$(node -e "process.stdout.write(JSON.stringify({command: 'ls -la'}))")
    ;;
  *)
    TOOL_ARGS=$(node -e "process.stdout.write(JSON.stringify({}))")
    ;;
esac

# Build the preToolUse JSON payload
TIMESTAMP=$(date +%s)000
CWD=$(pwd)
PAYLOAD=$(node -e "
const payload = {
  timestamp: $TIMESTAMP,
  cwd: '$CWD',
  toolName: '$TOOL_NAME',
  toolArgs: process.argv[1]
};
process.stdout.write(JSON.stringify(payload));
" -- "$TOOL_ARGS")

if [ "$DRY_RUN" = "1" ]; then
  echo "$PAYLOAD"
  exit 0
fi

# Pipe to plan-review.sh
echo "$PAYLOAD" | bash "$SCRIPT_DIR/../scripts/plan-review.sh"
