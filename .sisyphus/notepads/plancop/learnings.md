# Learnings — Plancop

## [2026-03-01] Session Start

### Plannotator Source Layout (VERIFIED LOCALLY)
- Location: /home/developer/.claude/plugins/marketplaces/plannotator
- packages/ui/ has NO src/ subdir — components, utils, hooks are DIRECT children of packages/ui/
- packages/ui/types.ts — annotation types at root of ui package (not in components/)
- packages/ui/components/ — 27 .tsx files (6,034 lines)
- packages/ui/utils/ — 13 .ts files (1,271 lines)
- packages/ui/hooks/ — 5 .ts files
- packages/server/ — 12 files (2,005 lines), heavy Bun usage
- packages/editor/ — App.tsx + index.css only
- apps/hook/ — server/index.ts (4 Bun calls), index.tsx, vite.config.ts

### Copilot CLI Hook API (VERIFIED)
- hooks.json location: .github/hooks/*.json (NOT project root)
- stdin fields: {timestamp, cwd, toolName, toolArgs}
- toolArgs: JSON STRING — double-parse required (CRITICAL GOTCHA)
- stdout: {permissionDecision, permissionDecisionReason}
- Only "deny" is processed; "allow"/"ask" are no-ops; exit 0 = allow
- Default timeout: 30s — must set timeoutSec:86400 explicitly
- stderr: safe for logging, not parsed

### Plannotator Bun API calls (28 across 10 files)
- Bun.serve() → http.createServer()
- Bun.file().text() → fs.readFileSync()
- Bun.write() → fs.writeFileSync()
- Bun.$`git...` → child_process.execSync()
- Bun.sleep() → new Promise(r => setTimeout(r, ms))
- Bun.stdin → process.stdin or PLAN_INPUT env var

### Stack
- React 19.2.3, Tailwind 4.1.18, Vite 6.2.0, TypeScript 5.8.2
- @plannotator/web-highlighter (npm, zero Bun deps)
- @pierre/diffs (NOT diff.diffLines — spec was wrong)
- happy-dom for component tests

## [2026-03-01] Task 1 Flatten Execution

### Flattened Copy Map Applied
- `ui/src/components/` copied from `packages/ui/components/`
- `ui/src/utils/` copied from `packages/ui/utils/`
- `ui/src/hooks/` copied from `packages/ui/hooks/`
- `ui/src/types.ts` copied from `packages/ui/types.ts`
- `ui/src/App.tsx` + `ui/src/index.css` copied from `packages/editor/`
- `server/` copied from `packages/server/` (Bun APIs intentionally preserved)
- `ui/vite.config.ts`, `ui/index.tsx`, `ui/index.html` copied from `apps/hook/`

### Editor Package Dependency Reference
- Source: `packages/editor/package.json` from fresh GitHub clone
- dependencies: `@plannotator/ui: workspace:*`, `react:^19.2.3`, `react-dom:^19.2.3`, `tailwindcss:^4.1.18`
- `@plannotator/ui` is a workspace ref and will need replacement in later wave when wiring flat package manifests

### Verification Notes
- Confirmed no `packages/`, no `apps/`, no `bunfig.toml`, no `bun.lock`
- Confirmed no `workspace` entries in JSON files under this repo after flatten step
- QA evidence written to `.sisyphus/evidence/task-1-flatten-structure.txt` and `.sisyphus/evidence/task-1-no-monorepo.txt`

## [2026-02-28] Task 3: Type Definitions Created

### Type System Architecture
- **hook.ts** (51 lines): PreToolUseInput, EditToolArgs, CreateToolArgs, BashToolArgs, HookDecision interfaces + isValidPreToolUseInput() type guard
- **annotation.ts** (24 lines): AnnotationType union, HighlightMeta, Annotation interfaces
- **plan.ts** (19 lines): PlanData, SharePayload interfaces with proper imports
- **index.ts** (3 lines): Barrel export pattern for all types
- **hook.test.ts** (36 lines): 6 test cases covering valid input, missing fields, double-parse gotcha, null/empty object rejection

### Critical Gotchas Encoded
1. **Double-parse requirement**: toolArgs is JSON STRING in PreToolUseInput — must JSON.parse() twice to get actual args
   - Test case explicitly validates rejection of toolArgs as object (the gotcha)
2. **HookDecision processing**: Only 'deny' is processed; 'allow'/'ask' are no-ops
   - Type definition includes only 'allow' | 'deny' (no 'ask')
   - permissionDecisionReason is optional but required when denying
3. **Type safety**: Zero 'any' types, all interfaces fully typed

### Test Coverage
- Valid hook input acceptance
- Missing required fields (timestamp, cwd, toolName, toolArgs)
- Double-parse gotcha (toolArgs must be string, not object)
- Null and empty object rejection
- Type guard returns boolean with proper type narrowing

### File Structure
```
src/types/
├── hook.ts              (interfaces + type guard)
├── annotation.ts        (annotation types)
├── plan.ts              (plan data types)
├── index.ts             (barrel export)
└── __tests__/
    └── hook.test.ts     (vitest suite)
```

All files use `.js` extensions in imports (ESM-ready for Node 18+).

## [2026-02-28] Task 4: Bash Hook Entry Point Created

### scripts/plan-review.sh Implementation
- **Location**: `scripts/plan-review.sh` (117 lines, executable)
- **Purpose**: preToolUse hook entry point for Copilot CLI
- **Key Features**:
  1. Reads stdin JSON (Copilot CLI API: {timestamp, cwd, toolName, toolArgs})
  2. Parses toolName using `node -e` (no jq dependency)
  3. Filters by PLANCOP_MODE (auto, off, aggressive, always)
  4. Default intercept list: edit, create, write
  5. Passes through non-intercepted tools instantly (exit 0, no stdout)
  6. Launches Node.js server for intercepted tools
  7. Fails open if server missing (Wave 2 task)
  8. Logs to stderr only (safe — Copilot CLI only parses stdout)

### Mode Behavior
- **auto** (default): Intercept edit, create, write only
- **off**: Pass through all tools instantly
- **aggressive**: Intercept edit, create, write, bash
- **always**: Intercept all tools

### QA Evidence
- ✅ task-4-passthrough.txt: read tool passes through (exit 0, no stdout)
- ✅ task-4-mode-off.txt: PLANCOP_MODE=off with edit tool passes through (exit 0)
- ✅ task-4-intercepted-no-server.txt: edit tool intercepted, server missing, fails open (exit 0)

### Critical Implementation Details
- Uses `#!/usr/bin/env bash` for portability (not `#!/bin/bash`)
- JSON parsing via `node -e` (no external dependencies)
- Temp file cleanup via trap on EXIT
- Server path resolved relative to script directory
- PLAN_INPUT env var passes stdin to server (stdin already consumed)
- Browser open via xdg-open (Linux) or open (macOS)
- Fail-open behavior: missing server = allow tool to proceed

## [2026-02-28] Task 10: Hook Integration + Double-Parse

### server/hook.ts conventions established
- `parsePreToolUseInput(raw)` must parse outer JSON then validate with `isValidPreToolUseInput`; throw typed errors for invalid JSON vs invalid shape.
- `parseToolArgs(toolArgsStr)` must parse the inner JSON string and return a structured `{ error: "Invalid toolArgs JSON" }` object on malformed input (no unhandled throw).
- `buildPlanData(input)` should always return `PlanData` with `plan: ""` for hook entry path and parsed `toolArgs` payload.
- `getDecisionJSON('allow')` and `getDecisionJSON('deny', reason)` should stringify exact Copilot-compatible payloads without extra fields.

### verification pattern
- Vitest target run: `npx vitest run server/__tests__/hook.test.ts`.
- LSP diagnostics checked clean for both `server/hook.ts` and `server/__tests__/hook.test.ts`.

## [2026-02-28] Task 7: Node http server core port

### Route + lifecycle pattern used in plancop
- `server/index.ts` now runs as a Node entrypoint with `http.createServer()` and no Bun APIs.
- Startup reads `PLAN_INPUT` from env, parses outer JSON and inner `toolArgs` JSON string, and exposes enriched data on `GET /api/plan`.
- Required routes implemented: `GET /`, `GET /api/status`, `GET /api/plan`, `POST /api/approve`, `POST /api/deny`, `GET /api/versions`, `GET /api/version/:id`.
- CORS is handled centrally with `Access-Control-Allow-Origin: *`, methods `GET,POST,OPTIONS`, and `Content-Type` header allowance.
- Decision lifecycle is explicit: wait for approve/deny -> write one JSON decision to stdout -> wait 500ms -> close server -> `process.exit(0)`.
- Server bind/log contract is exactly `server.listen(0, ...)` and `process.stderr.write("PLANCOP_PORT:" + port + "\\n")`.

### TDD + verification notes
- Route behavior covered in `server/__tests__/index.test.ts` including approve and deny exit-output assertions.
- End-to-end smoke checks were captured in `.sisyphus/evidence/task-7-health-check.txt`, `.sisyphus/evidence/task-7-approve-flow.txt`, and `.sisyphus/evidence/task-7-deny-flow.txt`.
- `rg 'Bun\.' server/index.ts` and `rg "require\(" server/index.ts | rg -v "node:"` both produce zero matches.


## [2026-02-28] Task 8: Port Bun Utilities to Node.js

### Bun → Node.js API mapping applied
- `import { $ } from "bun"` → `import { execFileSync, spawnSync } from "child_process"`
- `$\`git cmd\`.quiet()` (throws on non-zero) → `execFileSync("git", ["cmd"], { encoding: "utf-8", stdio: "pipe" })`
- `$\`git cmd\`.quiet().nothrow()` (returns exitCode) → `spawnSync("git", ["cmd"], { encoding: "utf-8", stdio: "pipe" })` + check `.status`
- `Bun.file(path).exists()` → `existsSync(path)` from `fs`
- `Bun.file(path).text()` → `readFileSync(path, "utf-8")` from `fs`
- `console.error()` → `process.stderr.write()` (per zero-dep constraint)
- `import from "bun:test"` → `import from "vitest"`

### Key decisions
- **execFileSync vs execSync**: Used `execFileSync` (array args) for safety — no shell injection risk from user input
- **spawnSync for .nothrow()**: `spawnSync` returns result object with `.status` instead of throwing — maps directly to Bun's `.nothrow()` pattern
- **spawn for browser**: Used `spawn` with `detached: true` + `unref()` for browser opening — `execFileSync("xdg-open")` blocks until browser process exits, causing test timeouts
- **Fire-and-forget pattern**: `spawnBrowser()` uses a 100ms timeout to detect immediate ENOENT errors before resolving true

### Files ported (4 active + 1 test, 2 already clean)
- `server/git.ts`: 8 Bun API calls → execFileSync/spawnSync
- `server/browser.ts`: Bun.file() + 6x `$` → fs + spawn
- `server/repo.ts`: 4x `$` → spawnSync
- `server/project.ts`: 1x `$` → spawnSync
- `server/project.test.ts`: bun:test → vitest
- `server/storage.ts`: already ported (was done in T1)
- `server/image.ts`: no Bun APIs (pure path operations)

### Gotcha: xdg-open blocking
- `execFileSync("xdg-open", [url])` blocks the Node.js event loop until xdg-open exits
- On Linux, xdg-open may wait for the launched browser to close
- Solution: `spawn()` with `detached: true` and `child.unref()` for fire-and-forget
- This matches the semantic intent of the original Bun code better
## [2026-02-28] Task 11: Hook Entry Script Wiring

### Server Launch Pattern (Fixed)
- **Problem**: Original pipe pattern (`2>&1 | while read`) merged stdout/stderr AND ran while loop in subshell (PORT variable lost)
- **Solution**: Background process with separate file redirects:
  ```bash
  npx tsx server.ts > $DECISION_FILE 2> $STDERR_FILE &
  SERVER_PID=$!
  # Poll STDERR_FILE for PLANCOP_PORT:XXXX
  # wait $SERVER_PID
  # cat $DECISION_FILE
  ```
- Stdout (decision JSON) goes to DECISION_FILE, stderr (port + debug) goes to STDERR_FILE

### Critical Bash Gotcha: set -euo pipefail + grep
- `PORT=$(grep -o 'pattern' file)` with `set -e` exits the script when grep finds nothing (returns 1)
- Fix: `PORT=$(grep ... || true)` — the `|| true` prevents set -e from triggering
- With `pipefail`, multi-stage pipe like `grep | head | cut` fails if ANY stage fails

### tsx Cold Start
- `npx tsx` takes 2-4 seconds on first invocation (TypeScript compilation)
- Timeout increased from 3s (30×0.1s) to 10s (100×0.1s) for reliability
- Subsequent runs are faster due to caching

### CLI Entry Point Architecture
- Created `scripts/plancop-server.ts` — standalone Node.js-compatible CLI
- Uses Node `http` module (not Bun) — works with `npx tsx`
- Server library (`server/index.ts`) uses Bun APIs → can't run with tsx
- CLI entry point is independent, serves minimal review HTML
- Endpoints: /api/approve, /api/deny, /api/plan, / (HTML)

### PLANCOP_PORT Env Var
- Bash script exports PLANCOP_PORT if set
- CLI server reads PLANCOP_PORT or PLANNOTATOR_PORT as fallback
- Default: port 0 (OS assigns random)
- Pinning works: PLANCOP_PORT=9999 binds to exactly 9999

### Temp File Cleanup
- Both DECISION_FILE and STDERR_FILE cleaned via `trap 'rm -f ...' EXIT`
- Trap fires on normal exit, error exit, and signals
- Verified: no /tmp/plancop-* files left after any test scenario
