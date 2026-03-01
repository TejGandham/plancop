# Plancop

Visual plan review for Copilot CLI — annotate, approve, or deny agent plans with a browser-based UI.

## What is Plancop?

Plancop intercepts Copilot CLI tool calls (edit, create, write, bash) via a `preToolUse` hook and opens a browser UI for visual inspection. Review the agent's proposed changes, add annotations, and approve or deny the plan. Annotations are sent back to the agent for refinement.

It also works as an MCP server for Claude Desktop and other MCP clients.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/TejGandham/plancop.git
   cd plancop
   ```

2. Install dependencies:
   ```bash
   npm install
   cd ui && npm install && cd ..
   ```

3. Build the UI:
   ```bash
   npm run build
   ```

4. Register the hook with Copilot CLI by adding the plugin path to your Copilot CLI configuration. The hook is defined in `.github/hooks/plancop.json`.

## Usage

### How It Works

1. **Hook Registration**: Plancop registers a `preToolUse` hook with Copilot CLI (via `.github/hooks/plancop.json`)
2. **Interception**: When the agent calls edit/create/write tools, `scripts/plan-review.sh` fires
3. **Server Launch**: The hook spawns `server/index.ts`, which starts an HTTP server on an auto-assigned port
4. **Review**: A browser opens with the plan UI — you annotate, then approve or deny
5. **Feedback**: Your decision (and annotations) are returned to Copilot CLI, which forwards them to the agent

### MCP Server

Plancop also provides an MCP server (`mcp/server.js`) with a single tool: `submit_plan`. Configure it in your MCP client using `.mcp.json`:

```json
{
  "mcpServers": {
    "plancop": {
      "command": "node",
      "args": ["mcp/server.js"]
    }
  }
}
```

### UI Overview

The Plancop UI displays:
- **Left Panel**: Table of contents with headings and annotation counts
- **Center**: Markdown plan with syntax highlighting and inline annotations
- **Right Panel**: Annotation details, edit history, and export options

### Keyboard Shortcuts

- **Cmd/Ctrl+Enter**: Approve plan (no annotations) or send feedback (with annotations)
- **Cmd/Ctrl+Shift+Enter**: Send feedback/deny (always sends feedback)
- **Escape**: Close any open modal or cancel annotation
- **Cmd/Ctrl+S**: Save annotations to default notes app (Obsidian, Bear, or download)

## Configuration

### Environment Variables

- **PLANCOP_MODE** (default: `auto`)
  - `auto`: Intercept edit, create, write tools
  - `aggressive`: Also intercept bash tool calls
  - `always`: Intercept all tool calls
  - `off`: Disable Plancop entirely

  ```bash
  export PLANCOP_MODE=aggressive
  ```

- **PLANCOP_SESSION_MODE** (default: `persistent`)
  - `ephemeral`: Server exits after one decision
  - `persistent`: Server stays alive for 5 minutes, reused across tool calls

### Intercept List

By default, Plancop intercepts these tools:
- `edit` — Modify existing files
- `create` — Create new files
- `write` — Write file content

In `aggressive` mode, also intercepts:
- `bash` — Execute shell commands

## Development

### Setup

```bash
npm install
cd ui && npm install && cd ..
```

### Development Server

```bash
npm run dev
```

This starts the Vite dev server for the React UI at `http://localhost:5173`.

### Running Tests

```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

### Building for Production

```bash
npm run build
```

Output is a single self-contained HTML file at `ui/dist/index.html`.

### Type Checking

```bash
npm run lint
```

## Architecture

### System Flow

```
Copilot CLI
    ↓
preToolUse Hook (scripts/plan-review.sh)
    ↓
HTTP Server (server/index.ts)
    ├─ Reads plan from PLAN_INPUT env var
    ├─ Starts HTTP server on auto-assigned port
    ├─ Opens browser UI
    ├─ Waits for user decision
    └─ Returns approve/deny to Copilot CLI
    ↓
Browser UI (React + Vite)
    ├─ Displays plan markdown
    ├─ Handles annotations
    ├─ Exports to notes apps
    └─ Sends decision back to server
```

### Project Structure

```
plancop/
├── scripts/
│   └── plan-review.sh          # Copilot CLI hook entry point (bash)
├── server/                      # HTTP server (zero npm deps, Node built-ins only)
│   ├── index.ts                 # Main server — routes, SSE, lifecycle
│   ├── enrichment.ts            # Tool arg enrichment, language detection
│   ├── hook.ts                  # Hook input parsing, decision serialization
│   ├── mode.ts                  # Interception mode logic
│   ├── session.ts               # PID file, inactivity timeout
│   ├── storage-versions.ts      # Plan version history
│   ├── config.ts                # Config from .plancop/config.json
│   └── __tests__/               # Server tests (child-process spawn pattern)
├── mcp/                          # MCP stdio server (JSON-RPC 2.0)
│   ├── server.js                 # Single tool: submit_plan
│   └── __tests__/                # JSON-RPC protocol tests
├── ui/                           # React UI (Vite single-file build)
│   ├── src/
│   │   ├── App.tsx               # Main React component
│   │   ├── components/           # 32 UI components
│   │   ├── hooks/                # 10 custom hooks
│   │   ├── utils/                # 16 utilities
│   │   └── __tests__/            # UI tests
│   ├── index.html                # HTML entry point
│   └── vite.config.ts            # Vite configuration
├── src/types/                    # Shared TypeScript types
├── test/fixtures/                # Test data
├── .github/hooks/plancop.json    # preToolUse hook registration
├── plugin.json                   # Copilot CLI plugin manifest
├── .mcp.json                     # MCP server registration
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key Components

**Server** (`server/index.ts`):
- Starts HTTP server on auto-assigned port (always port 0)
- Serves React UI from `ui/dist/index.html`
- Handles `/api/plan` (GET) — returns enriched plan data
- Handles `/api/approve` (POST) — user approved
- Handles `/api/deny` (POST) — user denied with feedback
- Handles `/api/push-plan` (POST) — accept new plan (persistent mode)
- Handles `/api/events` (GET) — SSE stream for real-time updates

**MCP Server** (`mcp/server.js`):
- JSON-RPC 2.0 over stdio
- Single tool: `submit_plan` — opens browser UI, waits for decision
- Independent from `server/index.ts` (separate process, separate lifecycle)

**UI** (`ui/src/App.tsx`):
- Parses markdown plan into blocks
- Manages annotations (create, edit, delete)
- Exports to Obsidian, Bear, or downloads
- Keyboard shortcuts for quick actions
- URL-based sharing of annotated reviews
- Plan version history and diff viewer

## Features

- Visual plan review with syntax highlighting
- Inline annotations with author tracking
- Export to Obsidian, Bear, or download
- Keyboard shortcuts for power users
- URL-based sharing of reviews
- Image attachments support
- Plan version history with diff viewer
- Dark mode support
- MCP server for Claude Desktop integration

## Troubleshooting

### Server Won't Start

Check that Node.js 22+ and npm are installed:
```bash
node --version
npm --version
```

Ensure the UI is built:
```bash
npm run build
```

### Browser Won't Open

If the browser doesn't open automatically, manually visit the URL printed to stderr:
```
plancop: Review UI at http://127.0.0.1:<PORT>
```

The port is auto-assigned — check the stderr output for the actual port number.

### Annotations Not Saved

Ensure you click "Approve" or "Send Feedback" to submit your annotations. Closing the browser without submitting will discard changes.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT — See LICENSE file for details.
