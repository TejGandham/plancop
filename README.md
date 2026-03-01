# Plancop

Visual plan review for Copilot CLI — annotate, approve, or deny agent plans with a browser-based UI.

## What is Plancop?

Plancop is a plan review plugin for Copilot CLI that intercepts tool calls (edit, create, write, bash) and opens a browser UI for visual inspection. Review the agent's proposed changes, add annotations, and approve or deny the plan. Annotations are sent back to the agent for refinement.

## Installation

### Via Plugin Registry (Recommended)

```bash
copilot plugin install plancop
```

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/backnotprop/plancop.git
   cd plancop
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the UI:
   ```bash
   npm run build
   ```

4. Register with Copilot CLI:
   ```bash
   copilot plugin install ./
   ```

### Global NPM Installation

```bash
npm install -g plancop
copilot plugin install $(npm root -g)/plancop
```

## Usage

### How It Works

1. **Hook Integration**: Plancop registers a `preToolUse` hook with Copilot CLI
2. **Interception**: When the agent calls edit/create/write/bash tools, the hook fires
3. **Server Launch**: A Node.js server starts and opens a browser UI on `http://127.0.0.1:PORT`
4. **Review**: You annotate the plan, then approve or deny
5. **Feedback**: Your decision and annotations are sent back to the agent

### UI Overview

The Plancop UI displays:
- **Left Panel**: Table of contents with headings and annotations
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
  copilot plan
  ```

- **PLANCOP_PORT** (default: auto-assigned)
  - Specify a custom port for the review server
  
  ```bash
  export PLANCOP_PORT=3000
  copilot plan
  ```

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
npm test:watch
```

### Building for Production

```bash
npm run build
```

Output is in `ui/dist/`.

### Type Checking

```bash
npm run lint
```

## Architecture

### System Flow

```
Copilot CLI
    ↓
preToolUse Hook (plan-review.sh)
    ↓
Node.js Server (plancop-server.ts)
    ├─ Reads tool call from stdin
    ├─ Launches browser UI
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
│   ├── plan-review.sh          # Copilot CLI hook entry point
│   └── plancop-server.ts       # Node.js review server
├── server/
│   ├── index.ts                # Server main logic
│   ├── review.ts               # Plan review handler
│   ├── annotate.ts             # Annotation processing
│   ├── browser.ts              # Browser launch
│   ├── git.ts                  # Git integration
│   ├── integrations.ts         # Obsidian, Bear, etc.
│   └── __tests__/              # Server tests
├── ui/
│   ├── src/
│   │   ├── App.tsx             # Main React component
│   │   ├── components/         # UI components
│   │   ├── hooks/              # React hooks
│   │   ├── utils/              # Utilities
│   │   └── __tests__/          # UI tests
│   ├── index.html              # HTML entry point
│   └── vite.config.ts          # Vite configuration
├── test/
│   └── fixtures/               # Test data
├── package.json
├── tsconfig.json
└── README.md
```

### Key Components

**Server** (`server/index.ts`):
- Starts HTTP server on auto-assigned port
- Serves React UI
- Handles `/api/plan` (GET) — returns plan data
- Handles `/api/approve` (POST) — user approved
- Handles `/api/deny` (POST) — user denied with feedback
- Handles `/api/feedback` (POST) — annotation feedback

**UI** (`ui/src/App.tsx`):
- Parses markdown plan into blocks
- Manages annotations (create, edit, delete)
- Exports to Obsidian, Bear, or downloads
- Keyboard shortcuts for quick actions
- Sharing via URL-encoded annotations

**Integrations** (`server/integrations.ts`):
- Obsidian vault integration
- Bear notes integration
- File system operations

## Features

- ✅ Visual plan review with syntax highlighting
- ✅ Inline annotations with author tracking
- ✅ Export to Obsidian, Bear, or download
- ✅ Keyboard shortcuts for power users
- ✅ URL-based sharing of reviews
- ✅ Git integration (branch, repo info)
- ✅ Image attachments support
- ✅ Plan version history (when available)
- ✅ Dark mode support

## Troubleshooting

### Server Won't Start

Check that Node.js and npm are installed:
```bash
node --version
npm --version
```

### Browser Won't Open

If the browser doesn't open automatically, manually visit the URL printed to stderr:
```
plancop: Review UI at http://127.0.0.1:3000
```

### Annotations Not Saved

Ensure you click "Approve" or "Send Feedback" to submit your annotations. Closing the browser without submitting will discard changes.

### Port Already in Use

Specify a different port:
```bash
export PLANCOP_PORT=3001
copilot plan
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT — See LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/backnotprop/plancop/issues)
- **Discussions**: [GitHub Discussions](https://github.com/backnotprop/plancop/discussions)
- **Documentation**: [Plancop Docs](https://plannotator.ai)
