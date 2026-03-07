# Plancop

> **Alpha software** — APIs, hook format, and UI may change between releases. Pin to a specific commit if stability matters.

Visual plan review for **Copilot CLI** and **Claude Code**. Intercept agent plans before they execute, annotate them in a browser UI, and approve or deny with structured feedback.

## TL;DR — Copilot CLI

```bash
# 1. Install
git clone https://github.com/TejGandham/plancop.git ~/tools/plancop
cd ~/tools/plancop && npm install && cd ui && npm install && cd .. && npm run build

# 2. Add hook to your project
mkdir -p .github/hooks
cat > .github/hooks/plancop.json << 'EOF'
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "bun run ~/tools/plancop/server/index.ts",
        "timeoutSec": 345600
      }
    ]
  }
}
EOF

# 3. Use Copilot CLI in plan mode (Shift+Tab) — plancop opens when the agent exits plan mode
```

<details>
<summary>Claude Code setup</summary>

```bash
mkdir -p .github/hooks
cat > .github/hooks/plancop.json << 'EOF'
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "bun run ~/tools/plancop/server/index.ts",
            "timeout": 345600
          }
        ]
      }
    ]
  }
}
EOF
```

</details>

## How It Works

1. Agent exits plan mode → plancop's hook intercepts the transition
2. Browser UI opens with the proposed plan
3. You annotate (delete, insert, replace, comment), then **approve** or **deny**
4. Your decision + annotations go back to the agent

| Agent | Hook trigger | Plan source |
|-------|-------------|-------------|
| Copilot CLI | `preToolUse` → `exit_plan_mode` | Reads `plan-01.md` from working directory |
| Claude Code | `PermissionRequest` → `ExitPlanMode` | Plan text delivered via stdin |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Enter` | Approve (no annotations) or send feedback (with annotations) |
| `Cmd/Ctrl+Shift+Enter` | Send feedback / deny |
| `Escape` | Close modal or cancel annotation |

## Install

### Prerequisites

- [Bun](https://bun.sh/) 1.x+
- [Node.js](https://nodejs.org/) 22+

See the [TL;DR](#tldr--copilot-cli) above for the full install in one copy-paste block.

## Development

```bash
npm install
cd ui && npm install && cd ..
npm run dev          # Vite dev server at localhost:5173
npm test             # Run all tests
npm run test:watch   # Watch mode
npm run build        # Build UI → ui/dist/index.html
npm run lint         # Type check (tsc --noEmit)
```

## Architecture

```
Copilot CLI (plan mode → exit_plan_mode)
    ↓ preToolUse hook
stdin (JSON) → server/index.ts (detects source, Bun.serve, auto-assigned port)
    ↓ reads plan-01.md
Browser UI (React + Vite, single-file build)
    ↓ POST /api/approve or /api/deny
stdout (permissionDecision JSON) → Copilot CLI
```

| Directory | Purpose |
|-----------|---------|
| `server/` | Bun HTTP server — zero npm deps, dual-agent support |
| `ui/` | React 19 + Vite 6 + Tailwind 4 — single-file build |
| `src/types/` | Shared TypeScript types (Claude Code + Copilot CLI) |

## Troubleshooting

**"plancop ui not built"** — Run `npm run build` in the plancop directory. The UI must be built before first use.

**Browser won't open** — Check stderr for the URL: `plancop: Review UI at http://localhost:<PORT>`. The port is auto-assigned each time.

**Annotations not saved** — You must click "Approve" or "Send Feedback". Closing the browser discards changes.

**Copilot CLI: hook fires on every tool call** — This is expected. Plancop exits instantly (< 10ms) for all non-`exit_plan_mode` tool calls. Only plan mode transitions open the review UI.

## License

MIT
