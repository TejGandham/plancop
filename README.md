# Plancop

Visual plan review for **Copilot CLI**. Annotate and review AI agent plans, approve or deny before they execute, and send structured feedback back to the agent — all from a browser UI. Works with any repository.

Inspired by [Plannotator](https://github.com/backnotprop/plannotator) (which supports Claude Code, OpenCode, and Pi), Plancop brings the same visual plan review experience to **GitHub Copilot CLI**.

## Features

| Feature | Description |
|---------|-------------|
| **Visual Plan Review** | Approve or deny agent plans with inline annotations |
| **Plan Diff** | See what changed when the agent revises a plan |
| **Annotations** | Delete, insert, replace, or comment on specific lines |
| **Sharing** | Share annotated plans via compressed URL — no backend, nothing stored |
| **Export** | Save annotations to Obsidian, Bear, or download |
| **Dark Mode** | System-aware theme switching |

## How It Works

When Copilot CLI's agent proposes file edits, new files, or shell commands:

1. Plancop's `preToolUse` hook intercepts the tool call
2. A browser UI opens with the proposed changes
3. You review, annotate, and **approve** or **deny**
4. Your decision and annotations are sent back to the agent

## Install

### Prerequisites

- Node.js 22+
- npm
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli)

### 1. Install plancop (once)

```bash
git clone https://github.com/TejGandham/plancop.git ~/tools/plancop
cd ~/tools/plancop
npm install
cd ui && npm install && cd ..
npm run build
```

You can clone it anywhere. Remember the path — you'll use it in step 2.

### 2. Add to any repo

Copilot CLI automatically loads hooks from `.github/hooks/` in whatever repo you're working in. For each repo where you want plan review:

```bash
mkdir -p .github/hooks
```

Create `.github/hooks/plancop.json`:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [{
      "type": "command",
      "bash": "~/tools/plancop/scripts/plan-review.sh",
      "timeoutSec": 86400
    }]
  }
}
```

Adjust the path to wherever you cloned plancop. The script resolves all paths relative to itself, so it works from any project.

### 3. Use it

Start a Copilot CLI session. When the agent tries to edit, create, or write a file, plancop intercepts and opens the review UI.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PLANCOP_MODE` | `auto` | `auto` (edit/create/write), `aggressive` (+bash), `always` (all tools), `off` (disabled) |
| `PLANCOP_SESSION_MODE` | `persistent` | `persistent` (server stays alive 5 min), `ephemeral` (exits after one decision) |

```bash
export PLANCOP_MODE=aggressive
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Enter` | Approve (no annotations) or send feedback (with annotations) |
| `Cmd/Ctrl+Shift+Enter` | Send feedback / deny |
| `Escape` | Close modal or cancel annotation |
| `Cmd/Ctrl+S` | Save to notes app (Obsidian, Bear, or download) |

## MCP Setup

Plancop also works as a standalone MCP server for **OpenCode**, **Claude Desktop**, and other MCP clients.

### OpenCode

Add to `opencode.json` (project root or `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "plancop": {
      "type": "local",
      "command": ["node", "~/tools/plancop/mcp/server.js"],
      "enabled": true
    }
  }
}
```

### Claude Desktop

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "plancop": {
      "command": "node",
      "args": ["~/tools/plancop/mcp/server.js"]
    }
  }
}
```

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
Copilot CLI
    ↓ preToolUse hook
scripts/plan-review.sh
    ↓ spawns
server/index.ts (HTTP, auto-assigned port)
    ↓ serves
Browser UI (React + Vite, single-file build)
    ↓ POST /api/approve or /api/deny
Decision returned to Copilot CLI
```

| Directory | Purpose |
|-----------|---------|
| `scripts/` | Copilot CLI hook entry point (bash) |
| `server/` | HTTP server — zero npm deps, Node built-ins only |
| `mcp/` | MCP stdio server (JSON-RPC 2.0) — independent from HTTP server |
| `ui/` | React 19 + Vite 6 + Tailwind 4 — single-file build |
| `src/types/` | Shared TypeScript types |

## Troubleshooting

**Server won't start** — Ensure Node.js 22+ is installed and the UI is built (`npm run build`).

**Browser won't open** — Check stderr for the URL: `plancop: Review UI at http://127.0.0.1:<PORT>`

**Annotations not saved** — You must click "Approve" or "Send Feedback". Closing the browser discards changes.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a Pull Request

## License

MIT — See LICENSE file for details.
