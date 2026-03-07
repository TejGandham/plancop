# Plancop — Agent Knowledge Base

**Updated:** 2026-03-07

## Overview

Visual plan review plugin for **Copilot CLI** and **Claude Code**. Intercepts plan mode exit events via agent-specific hooks, opens a browser UI for annotation and approval, returns the decision to the agent. The server auto-detects which agent invoked it. Two independent server interfaces: Bun HTTP (hook server) and Node MCP/JSON-RPC (Claude Desktop, OpenCode).

**Stack:** Bun 1.x · Node.js 22 · TypeScript (strict) · React 19 · Vite 6 · Tailwind CSS 4 · Vitest

## Structure

```
plancop/
├── server/                      # Bun HTTP hook server [→ server/AGENTS.md]
│   ├── index.ts                 # Hook server (Bun.serve, dual-agent, ~240 LOC)
│   ├── package.json             # { "type": "module" } — ESM marker
│   └── __tests__/               # Child-process spawn + storage tests
├── mcp/                         # MCP stdio server (JSON-RPC 2.0)
│   ├── server.js                # Single tool: submit_plan
│   └── __tests__/               # JSON-RPC protocol tests
├── ui/                          # React UI — Vite single-file build [→ ui/AGENTS.md]
│   ├── src/App.tsx              # Main component (~861 LOC)
│   ├── src/components/          # ~20 components (Viewer, AnnotationPanel, ImageAnnotator, etc.)
│   ├── src/hooks/               # 5 custom hooks (sidebar, activeSection, resizablePanel, etc.)
│   ├── src/utils/               # 6 utilities (parser, storage, feedback, etc.)
│   └── vite.config.ts           # Single-file build (all JS/CSS inlined into HTML)
├── src/types/                   # Shared types (hook.ts, plan.ts, annotation.ts)
├── test/fixtures/               # Test data
├── .github/hooks/plancop.json           # Claude Code: ExitPlanMode PermissionRequest hook
├── .github/hooks/copilot-plancop.json   # Copilot CLI: preToolUse hook for exit_plan_mode
├── .forgejo/workflows/ci.yml    # Forgejo CI (plancop-runner label)
├── .github/workflows/ci.yml     # GitHub Actions CI (ubuntu-latest)
├── plugin.json                  # Plugin metadata (v0.2.0)
└── .mcp.json                    # MCP server registration
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add HTTP route | `server/index.ts` | Inside `Bun.serve({ fetch })` handler |
| Add MCP tool | `mcp/server.js` handleToolsList + handleToolsCall | Follow submit_plan pattern |
| Add UI component | `ui/src/components/` | State lives in App.tsx, pass via props |
| Add custom hook | `ui/src/hooks/` | Return object, no side effects in hook body |
| Change hook I/O shape | `src/types/hook.ts` + `server/index.ts` | Dual-format: ExitPlanMode (Claude Code) + preToolUse (Copilot CLI) |
| Add server test | `server/__tests__/index.test.ts` | Child-process tests with stdin piping |
| Add MCP test | `mcp/__tests__/server.test.ts` | JSON-RPC via stdin, parse port from stderr |
| Add UI test | `ui/src/__tests__/` or `ui/src/components/__tests__/` | happy-dom, vi.fn() for fetch |
| Fix CI | `.forgejo/workflows/ci.yml` or `.github/workflows/ci.yml` | Forgejo needs `code.forgejo.org` action URLs |

## Data Flow

```
Copilot CLI ──exit_plan_mode──▶ preToolUse hook ──▶ server/index.ts (detects source)
                                                         │
                                                   Reads plan-01.md from cwd
                                                   Bun.serve(port 0) + Browser UI
                                                   POST /api/approve | /api/deny
                                                         │
                                                   stdout { permissionDecision } ──▶ Copilot CLI

Claude Code ──ExitPlanMode──▶ PermissionRequest hook ──▶ server/index.ts (detects source)
                                                         │
                                                   Plan text from stdin
                                                   Bun.serve(port 0) + Browser UI
                                                   POST /api/approve | /api/deny
                                                         │
                                                   stdout { hookSpecificOutput } ──▶ Claude Code

MCP Client ──JSON-RPC──▶ mcp/server.js ──launchReview()──▶ HTTP server (port 0)
                                                   │
                                             Same browser UI
                                             Decision returned via tool response
```

## Conventions

- **ESM everywhere** — `"type": "module"`, use `node:` prefix for builtins
- **Bun for hook server** — `Bun.serve()`, `Bun.stdin`, `Bun.file()`, `Bun.spawn()`
- **Zero server deps** — server/ uses only Bun built-ins. No Express, no npm packages.
- **Ephemeral only** — One review decision per invocation. No persistent mode.
- **Type guards over assertions** — Validate external data with runtime checks, not `as X`
- **Cookies, not localStorage** — UI persists settings via cookies (port changes each invocation)
- **Single-file UI build** — `vite-plugin-singlefile` inlines everything into one HTML file

## Anti-Patterns (Forbidden)

- `as any`, `@ts-ignore`, `@ts-expect-error` — Never add new type suppressions
- `console.log` in production code — Use stderr for diagnostics
- `require()` in TypeScript — ESM only (exception: mcp/server.js is JS)
- New npm dependencies in server/ — Must remain zero-dep
- `localStorage` in UI — Breaks across port changes. Use `ui/src/utils/storage.ts` (cookies)
- Hardcoded ports — Always `Bun.serve({ port: 0 })` for auto-assignment

## Commands

```bash
npm test                  # Run all 150 tests (9 files)
npm run test:coverage     # Tests + coverage enforcement (90% lines/funcs, 80% branches)
npm run build             # Build UI → ui/dist/index.html (single file, ~5MB)
npm run dev               # Vite dev server at localhost:5173
npm run lint              # tsc --noEmit (type check only)
```

## Gotchas (Will Break You)

### Stdin JSON input — dual format
Server reads all of stdin before starting. It auto-detects the source:
- **Copilot CLI**: `{ toolName: "exit_plan_mode", cwd: "...", toolArgs: "...", timestamp: ... }` — reads plan from `plan-01.md` in `cwd`
- **Claude Code**: `{ tool_input: { plan: "..." }, permission_mode?: "..." }` — plan text in stdin payload
- Non-`exit_plan_mode` tool calls exit immediately (< 10ms) with code 0

### Two separate servers
`server/index.ts` (Bun HTTP, spawned by hook) and `mcp/server.js` (Node JSON-RPC, spawned by MCP client) are **completely independent**. They share the same UI but have different lifecycles. Changing one does NOT update the other.

### Settled state is one-way
Once the decision resolves, subsequent approve/deny calls are silently ignored. Prevents double-resolution of the decision Promise.

### Port extraction in tests
Server prints `plancop: Review UI at http://localhost:PORT` to stderr. Tests parse this with regex. Changing this format breaks server tests.

### UI must be built first
`server/index.ts` reads `ui/dist/index.html`. If missing, returns 500. Always `npm run build` before running the server.

### Server tests use Node environment
`server/__tests__/index.test.ts` uses `// @vitest-environment node` to bypass happy-dom's CORS enforcement on cross-origin fetch. Do not remove this directive.

## Coverage Configuration

Only these files have enforced coverage thresholds (via `vitest.config.ts`):

| Module | Files |
|--------|-------|
| server/ | index.ts (child-process tested) |
| src/types/ | hook.ts |
| ui/src/utils/ | feedback.ts, parser.ts, annotationHelpers.ts |

`server/index.ts` and `mcp/server.js` are tested via child-process spawning — V8 coverage can't instrument them.

## CI Infrastructure

| Platform | Workflow | Runner | Trigger |
|----------|----------|--------|---------|
| Forgejo | `.forgejo/workflows/ci.yml` | `plancop-runner` (self-hosted) | push/PR to main |
| GitHub | `.github/workflows/ci.yml` | `ubuntu-latest` | push/PR to main |

Both: checkout → setup-node 22 → npm ci → cd ui && npm ci → npm run build → npm run test:coverage

**Forgejo-specific:** Use `https://code.forgejo.org/actions/checkout@v4` (not short-form). No npm cache. Silently ignores `continue-on-error`, `timeout-minutes`, `concurrency`, `permissions`.

## Quick Reference

| File | Gotcha |
|------|--------|
| `server/index.ts` | Reads stdin, auto-detects agent (Copilot CLI vs Claude Code), Bun.serve ephemeral |
| `mcp/server.js` | Independent from server/index.ts, 10-min timeout |
| `src/types/hook.ts` | Dual types: ExitPlanModeInput + CopilotPreToolUseInput |
| `ui/src/utils/storage.ts` | Cookies, not localStorage |
