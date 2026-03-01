# Plancop — Agent Knowledge Base

**Generated:** 2026-03-01 · **Commit:** 1bfa996 · **Branch:** main

## Overview

Visual plan review plugin for Copilot CLI. Intercepts tool calls (edit/create/write/bash), opens a browser UI for annotation and approval, returns decision to the agent. Two independent server interfaces: HTTP (Copilot CLI hook) and MCP/JSON-RPC (Claude Desktop).

**Stack:** Node.js 22 · TypeScript (strict) · React 19 · Vite 6 · Tailwind CSS 4 · Vitest

## Structure

```
plancop/
├── scripts/plan-review.sh       # Copilot CLI hook entry (bash wrapper)
├── server/                      # HTTP server — zero npm deps, Node built-ins only [→ server/AGENTS.md]
│   ├── index.ts                 # Main server (418 LOC, @ts-nocheck)
│   ├── enrichment.ts            # Tool arg enrichment + language detection
│   ├── hook.ts                  # Hook input parsing, decision serialization
│   ├── mode.ts                  # Interception mode (auto/aggressive/always/off)
│   ├── session.ts               # PID file, inactivity timeout
│   ├── storage-versions.ts      # Plan versioning in ~/.plancop/history/
│   ├── config.ts                # Config from .plancop/config.json
│   └── __tests__/               # Child-process spawn tests
├── mcp/                         # MCP stdio server (JSON-RPC 2.0)
│   ├── server.js                # Single tool: submit_plan
│   └── __tests__/               # JSON-RPC protocol tests
├── ui/                          # React UI — Vite single-file build [→ ui/AGENTS.md]
│   ├── src/App.tsx              # Main component (1600 LOC, 25+ useState)
│   ├── src/components/          # 32 components (Viewer, AnnotationPanel, ToolView, etc.)
│   ├── src/hooks/               # 10 custom hooks (sharing, agents, planDiff, etc.)
│   ├── src/utils/               # 16 utilities (parser, storage, feedback, etc.)
│   └── vite.config.ts           # Single-file build (all JS/CSS inlined into HTML)
├── src/types/                   # Shared types (hook.ts, plan.ts, annotation.ts)
├── test/fixtures/               # Test data
├── .github/hooks/plancop.json   # preToolUse hook registration
├── .forgejo/workflows/ci.yml    # Forgejo CI (plancop-runner label)
├── .github/workflows/ci.yml     # GitHub Actions CI (ubuntu-latest)
├── plugin.json                  # Copilot CLI plugin manifest
└── .mcp.json                    # MCP server registration
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add HTTP route | `server/index.ts` main() createServer callback | Match existing writeJson/readBody pattern |
| Add MCP tool | `mcp/server.js` handleToolsList + handleToolsCall | Follow submit_plan pattern |
| Add UI component | `ui/src/components/` | State lives in App.tsx, pass via props |
| Add custom hook | `ui/src/hooks/` | Return object, no side effects in hook body |
| Change interception rules | `server/mode.ts` | ReadonlySet constants |
| Modify plan storage | `server/storage-versions.ts` | Plans saved at ~/.plancop/history/ |
| Change hook input shape | `src/types/hook.ts` + `server/hook.ts` | toolArgs is double-parsed JSON string |
| Add server test | `server/__tests__/index.test.ts` | Use existing startServer() child-process helper |
| Add MCP test | `mcp/__tests__/server.test.ts` | JSON-RPC via stdin, parse port from stderr |
| Add UI test | `ui/src/__tests__/` or `ui/src/components/__tests__/` | happy-dom, vi.fn() for fetch |
| Fix CI | `.forgejo/workflows/ci.yml` or `.github/workflows/ci.yml` | Forgejo needs `code.forgejo.org` action URLs |

## Data Flow

```
Copilot CLI ──preToolUse──▶ plan-review.sh ──PLAN_INPUT env──▶ server/index.ts
                                                                    │
Claude Desktop ──JSON-RPC──▶ mcp/server.js ──launchReview()──▶ HTTP server (port 0)
                                                                    │
                                                              Browser UI (React)
                                                              GET /api/plan
                                                              POST /api/approve | /api/deny
                                                                    │
                                                              Decision returned
                                                              └──▶ stdout (ephemeral)
                                                              └──▶ /api/push-plan response (persistent)
```

## Conventions

- **ESM everywhere** — `"type": "module"`, use `node:` prefix for builtins
- **Zero server deps** — server/ uses only Node.js built-ins. No Express, no npm packages.
- **Type guards over assertions** — Validate external data with runtime checks, not `as X`
- **Return errors, don't throw** — Recoverable errors return `{ error: string }` (see `ToolArgsParseError`)
- **ReadonlySet for constants** — e.g. `VALID_MODES`, `AUTO_TOOLS` in mode.ts
- **Cookies, not localStorage** — UI persists settings via cookies (port changes each invocation)
- **Single-file UI build** — `vite-plugin-singlefile` inlines everything into one HTML file

## Anti-Patterns (Forbidden)

- `as any`, `@ts-ignore`, `@ts-expect-error` — Never add new type suppressions
- `console.log` in production code — Use `process.stderr.write` for diagnostics
- `require()` in TypeScript — ESM only (exception: mcp/server.js is JS)
- New npm dependencies in server/ — Must remain zero-dep
- `localStorage` in UI — Breaks across port changes. Use `ui/src/utils/storage.ts` (cookies)
- Hardcoded ports — Always `server.listen(0)` for auto-assignment

## Commands

```bash
npm test                  # Run all 267 tests (18 files, ~21s)
npm run test:coverage     # Tests + coverage enforcement (90% lines/funcs, 80% branches)
npm run build             # Build UI → ui/dist/index.html (single file, ~5MB)
npm run dev               # Vite dev server at localhost:5173
npm run lint              # tsc --noEmit (type check only)
```

## Gotchas (Will Break You)

### @ts-nocheck on server/index.ts
Line 1 disables TypeScript checking. Also on `server/__tests__/index.test.ts`. Complex Promise patterns and state management cause type errors. **Do NOT remove** without fixing all underlying type issues and running full test suite.

### PLAN_INPUT env var
Required JSON string in ephemeral mode. Contains `{ timestamp, cwd, toolName, toolArgs }`. Missing → crash. Invalid JSON → exit code 1. The `toolArgs` field is itself a JSON string that must be **parsed twice** (documented in `src/types/hook.ts`).

### Two separate servers
`server/index.ts` (HTTP, spawned by hook) and `mcp/server.js` (JSON-RPC, spawned by MCP client) are **completely independent**. They share the same UI but have different lifecycles. Changing one does NOT update the other.

### Ephemeral vs Persistent mode
- **Ephemeral** (default): Server exits after one decision. PLAN_INPUT required.
- **Persistent**: Server stays alive 5 minutes. PID file at `~/.plancop/server.pid`. `/api/push-plan` enabled; returns 409 if plan already pending.

### Dual-exit shutdown
`server/index.ts` calls `process.exit()` twice: once in `server.close()` callback, once after 500ms timeout. Cleanup code must complete within 500ms.

### Settled state is one-way
Once `reviewState.settled = true`, subsequent approve/deny calls are silently ignored. Prevents double-resolution of the decision Promise.

### Port extraction in tests
Server writes `PLANCOP_PORT:PORT_NUMBER\n` to stderr. Tests parse this with regex. Changing this format breaks all server and MCP tests.

### UI must be built first
`server/index.ts` reads `ui/dist/index.html`. If missing, serves a non-functional fallback page. Always `npm run build` before running the server.

### Hardcoded home directory
Plan history stored at `os.homedir() + "/.plancop/history/"`. Tests mock `HOME` env var. Breaks if homedir is unexpected (Docker, CI).

### Pre-existing TypeScript errors
`tsc --noEmit` shows ~12 errors in `server/enrichment.ts` and `server/hook.ts` (TS5097: extension imports). These are known and accepted — do NOT try to fix unless explicitly asked.

## Coverage Configuration

Only these files have enforced coverage thresholds (via `vitest.config.ts`):

| Module | Files |
|--------|-------|
| server/ | mode.ts, config.ts, session.ts, enrichment.ts, hook.ts, storage-versions.ts |
| src/types/ | hook.ts |
| ui/src/utils/ | feedback.ts, parser.ts, annotationHelpers.ts, planDiffEngine.ts |
| ui/src/components/ | ToolView.tsx, EditToolView.tsx, CreateToolView.tsx, BashToolView.tsx |

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
| `server/index.ts` | @ts-nocheck, complex async state, dual-exit shutdown |
| `mcp/server.js` | Independent from server/index.ts, 10-min timeout |
| `server/session.ts` | Hardcoded ~/.plancop path |
| `ui/src/utils/storage.ts` | Cookies, not localStorage |
| `scripts/plan-review.sh` | Parses PLANCOP_PORT from stderr, fail-open on errors |
| `src/types/hook.ts` | toolArgs requires double JSON parse |
