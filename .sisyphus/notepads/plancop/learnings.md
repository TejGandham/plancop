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
