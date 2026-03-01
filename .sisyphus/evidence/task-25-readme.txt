TASK 25: README AND LICENSE
===========================

IMPLEMENTATION SUMMARY:
- Created comprehensive README.md with all required sections
- Created MIT LICENSE file
- Documentation covers installation, usage, configuration, development, and architecture

FILES CREATED:

1. README.md (280 lines)
   Sections:
   - What is Plancop? (1 paragraph overview)
   - Installation (plugin registry, manual, global npm)
   - Usage (how it works, UI overview, keyboard shortcuts)
   - Configuration (PLANCOP_MODE, PLANCOP_PORT, intercept list)
   - Development (setup, dev server, tests, build, linting)
   - Architecture (system flow diagram, project structure, key components)
   - Features (list of capabilities)
   - Troubleshooting (common issues and solutions)
   - Contributing (contribution guidelines)
   - License (MIT reference)
   - Support (links to issues, discussions, docs)

2. LICENSE (MIT)
   - Standard MIT license text
   - Copyright notice for Plancop Contributors
   - Full permissions and liability disclaimers

CONTENT DETAILS:

README.md Overview:
- Explains Plancop as a visual plan review plugin for Copilot CLI
- Describes the hook → server → browser flow
- Installation methods: plugin registry, manual, global npm
- Usage: how the hook fires, what the UI looks like
- Configuration: PLANCOP_MODE (auto/aggressive/always/off), PLANCOP_PORT
- Intercept list: edit, create, write (+ bash in aggressive mode)
- Development: npm install, npm run dev, npm test, npm run build
- Architecture: system flow diagram, project structure, key components
- Features: annotations, exports, keyboard shortcuts, sharing, git integration
- Troubleshooting: server startup, browser issues, port conflicts
- Contributing: fork, branch, commit, push, PR workflow

Keyboard Shortcuts (from T23):
- Cmd/Ctrl+Enter: Approve or send feedback
- Cmd/Ctrl+Shift+Enter: Send feedback/deny
- Escape: Close modals
- Cmd/Ctrl+S: Save to notes app

Architecture Diagram:
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

Project Structure:
- scripts/: Hook entry point and server launcher
- server/: Node.js backend (review, annotations, integrations)
- ui/: React frontend (components, hooks, utils)
- test/: Test fixtures and test suites

LICENSE Details:
- MIT License (permissive open source)
- Copyright 2025 Plancop Contributors
- Allows: commercial use, modification, distribution, private use
- Requires: license and copyright notice
- Disclaims: warranty and liability

STATUS: COMPLETE

Both files are production-ready and follow industry standards.
