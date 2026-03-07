# Plancop (alpha)

Visual plan review for **Claude Code**. Annotate and review AI agent plans, approve or deny before they execute, and send structured feedback back to the agent — all from a browser UI.

Inspired by [Plannotator](https://github.com/backnotprop/plannotator), Plancop brings visual plan review to Claude Code via the `ExitPlanMode` hook.

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

When Claude Code exits plan mode and presents its plan:

1. Plancop's `PermissionRequest` hook matches the `ExitPlanMode` event
2. A browser UI opens with the proposed plan
3. You review, annotate, and **approve** or **deny**
4. Your decision and annotations are sent back to the agent

## Install

### Prerequisites

- [Bun](https://bun.sh/) 1.x+
- [Node.js](https://nodejs.org/) 22+ (for MCP server and npm)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

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

Claude Code loads hooks from `.github/hooks/` in your project. For each repo where you want plan review:

```bash
mkdir -p .github/hooks
```

Create `.github/hooks/plancop.json`:

```json
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
```

Adjust the path to wherever you cloned plancop. The timeout (in ms) gives you ~5.7 minutes to review.

### 3. Use it

Start a Claude Code session. When the agent exits plan mode, plancop intercepts and opens the review UI.

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
Claude Code
    ↓ PermissionRequest hook (matcher: ExitPlanMode)
stdin (JSON) → server/index.ts (Bun.serve, auto-assigned port)
    ↓ serves
Browser UI (React + Vite, single-file build)
    ↓ POST /api/approve or /api/deny
stdout (PermissionRequest JSON) → Claude Code
```

| Directory | Purpose |
|-----------|---------|
| `server/` | Bun HTTP server — zero npm deps |
| `mcp/` | MCP stdio server (JSON-RPC 2.0) — independent from HTTP server |
| `ui/` | React 19 + Vite 6 + Tailwind 4 — single-file build |
| `src/types/` | Shared TypeScript types |

## Troubleshooting

**"plancop ui not built"** — Run `npm run build` in the plancop directory. The UI must be built before first use.

**Browser won't open** — Check stderr for the URL: `plancop: Review UI at http://localhost:<PORT>`. The port is auto-assigned each time.

**Annotations not saved** — You must click "Approve" or "Send Feedback". Closing the browser discards changes.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a Pull Request

## License

MIT — See LICENSE file for details.
