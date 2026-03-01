# Plancop — Plannotator for Copilot CLI

## TL;DR

> **Quick Summary**: Fork Plannotator, flatten its monorepo, port Bun to Node.js, and adapt the hook system to Copilot CLI's `preToolUse` event — creating a browser-based plan review UI with annotations, version history, diff viewer, and URL sharing for GitHub Copilot CLI.
>
> **Deliverables**:
> - Copilot CLI plugin with `preToolUse` hook that intercepts edit/create tool calls
> - Browser-based review UI: markdown rendering, Mermaid diagrams, syntax highlighting
> - 5 annotation types (deletion, insertion, replacement, comment, global comment)
> - Structured feedback sent back to agent on deny
> - Plan version history with diff viewer
> - URL sharing via deflate compression (zero backend)
> - Advanced: session state, MCP server mode, configurable intercepts
>
> **Estimated Effort**: Large (approx. 2 weeks)
> **Parallel Execution**: YES — 7 waves
> **Critical Path**: T1 (clone+flatten) -> T5 (scaffolding) -> T7 (port server) -> T14 (approve/deny) -> T16 (storage) -> T20 (sharing) -> T27 (session state)

---

## Context

### Original Request
Build Plancop — a Plannotator-equivalent visual plan review tool for GitHub Copilot CLI. Fork Plannotator, flatten the monorepo into a single package, port the Bun runtime to Node.js (zero server dependencies), and adapt the hook format from Claude Code's `PermissionRequest` to Copilot CLI's `preToolUse` event.

### Interview Summary
**Key Discussions**:
- **Fork vs Clean-Room**: Confirmed fork+flatten approach. 82% of Plannotator (15,344 lines) ports with zero/trivial changes.
- **Scope**: Full implementation — Phases 0-6 including advanced features (MCP mode, session state, configurable intercepts).
- **Test Strategy**: TDD with vitest. Every task follows RED-GREEN-REFACTOR.
- **Source**: Clone fresh from GitHub (even though Plannotator exists locally at `/home/developer/.claude/plugins/marketplaces/plannotator`).
- **API Corrections**: 5 discrepancies between original spec and verified Copilot CLI API — all corrected in this plan.

**Research Findings**:
- **Plannotator source**: 28 Bun API calls across 10 files. packages/ui is pure React (7,305 lines, zero Bun deps). packages/server needs full port (2,005 lines). Uses `@pierre/diffs` (not `diff.diffLines`). React 19, Tailwind 4, Vite 6, TypeScript 5.8.
- **Copilot CLI API** (GA Feb 25, 2026): Hooks go in `.github/hooks/*.json`. Only `"deny"` permission decision is processed — `"allow"` and `"ask"` are accepted but ignored. Default timeout 30s (configurable). stderr safe for logging. No matcher/filter — must filter in script.
- **Plugin system**: `plugin.json` manifest with optional agents, skills, hooks, mcpServers fields. Install via `copilot plugin install ./path` or `OWNER/REPO`.

### Metis Review
**Identified Gaps** (addressed):
- **No ExitPlanMode equivalent**: Copilot CLI fires per-tool, not per-plan. Plan uses Option A (per-tool review) with session state in Wave 6 to reduce tab spam.
- **Timeout defaults to allow**: Set `timeoutSec: 86400` explicitly. Document fail-open behavior.
- **toolArgs is a JSON string**: Double-parse required. Documented in relevant tasks.
- **Node.js http module is not a drop-in**: Bun.serve has built-in Request/Response objects. Node's `http.createServer` needs manual body parsing, routing, CORS. Budget extra time for server port.
- **Browser tab spam**: Each hook invocation opens a new browser tab. Session state (Wave 6, Task 27) adds persistent server to reuse tabs.

---

## Work Objectives

### Core Objective
Create a Copilot CLI plugin that intercepts edit/create tool calls via `preToolUse` hook, opens a browser-based review UI where users can annotate plans with 5 annotation types, and sends structured feedback back to the agent on deny — with version history, diff comparison, and URL sharing.

### Concrete Deliverables
- `plugin.json` — Copilot CLI plugin manifest
- `.github/hooks/plancop.json` — Hook registration for `preToolUse`
- `scripts/plan-review.sh` — Bash hook entry point (filter + launch)
- `server/index.js` — Zero-dep Node.js HTTP server (ephemeral)
- `ui/dist/index.html` — Single-file React SPA (Vite + singlefile build)
- `storage/index.js` — Plan version history (fs-based)
- `test/simulate.sh` — Test harness with mock stdin
- Full annotation engine, markdown renderer, Mermaid support, diff viewer, URL sharing

### Definition of Done
- [ ] `bash test/simulate.sh edit` opens browser with plan review UI
- [ ] Clicking Approve outputs `{"permissionDecision":"allow"}` to stdout (or exits 0 silently)
- [ ] Clicking Deny with annotations outputs structured feedback in `permissionDecisionReason`
- [ ] `vitest run` passes all tests (0 failures)
- [ ] `npm run build` produces single-file HTML under 500KB
- [ ] Version history saves to `~/.plancop/history/` with dedup
- [ ] Share URL compresses/decompresses plan + annotations correctly

### Must Have
- preToolUse hook that intercepts `edit`, `create`, `write` tool calls
- Markdown rendering with syntax highlighting and Mermaid diagrams
- All 5 annotation types: DELETION, INSERTION, REPLACEMENT, COMMENT, GLOBAL_COMMENT
- Structured feedback format readable by LLMs
- Plan version history with diff comparison
- Dark theme matching terminal aesthetic
- Zero runtime dependencies for server (Node.js built-ins only)
- Works without internet (fully local except share portal)

### Must NOT Have (Guardrails)
- No Bun-specific APIs anywhere in final code (all ported to Node.js)
- No external npm dependencies in server/index.js (zero-dep server)
- No `console.log` in production code paths (use stderr for debug logging)
- No hardcoded ports (always random port via `server.listen(0)`)
- No OpenCode/Pi/Claude Code specific code (strip all during flatten)
- No `as any` or `@ts-ignore` type assertions
- No monorepo workspace structure (single flat package)
- Do not intercept `read`, `ls`, `view` tool calls (passthrough only)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (empty repo — will be set up in Wave 2)
- **Automated tests**: YES (TDD — RED-GREEN-REFACTOR)
- **Framework**: vitest (natural fit for Vite projects)
- **If TDD**: Each task writes failing tests FIRST, then implements to make them pass

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Server/Hook**: Use Bash (curl, node) — start server, send requests, assert responses
- **UI Components**: Use Playwright (playwright skill) — navigate, interact, assert DOM, screenshot
- **Shell Scripts**: Use interactive_bash (tmux) — run script with mock stdin, validate stdout
- **Build Pipeline**: Use Bash — run build commands, verify output files exist and are valid

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — bootstrap, 5 parallel):
├── T1:  Clone Plannotator + strip + flatten [deep]
├── T2:  Copilot CLI plugin metadata [quick]
├── T3:  Hook contract TypeScript types [quick]
├── T4:  Hook entry script skeleton [quick]
└── T5:  Test simulation harness [quick]

Wave 2 (After T1 — scaffolding + port, 6 parallel):
├── T6:  Project scaffolding + test infrastructure [quick]
├── T7:  Port server core: Bun.serve → http.createServer [deep]
├── T8:  Port Bun utilities: file I/O, git, browser, sleep [unspecified-high]
├── T9:  Vite + singlefile build pipeline verification [quick]
├── T10: Hook integration: stdin parsing + decision output [deep]
└── T11: Adapt hook entry script with server launch [unspecified-high]

Wave 3 (After Wave 2 — core UI features, 5 parallel):
├── T12: Verify/adapt markdown rendering pipeline [visual-engineering]
├── T13: Verify/adapt annotation engine [visual-engineering]
├── T14: Approve/deny flow: UI → server → stdout [deep]
├── T15: Feedback format: annotations → deny reason [unspecified-high]
└── T16: Plan data enrichment: toolArgs parsing + diffs [deep]

Wave 4 (After Wave 3 — version history, 4 parallel):
├── T17: Storage module: ~/.plancop/history/ [deep]
├── T18: Plan versioning: auto-save + dedup [unspecified-high]
├── T19: PlanDiffViewer: version comparison UI [visual-engineering]
└── T20: Version selector + header integration [visual-engineering]

Wave 5 (After Wave 4 — sharing + polish, 5 parallel):
├── T21: URL sharing: deflate + base64url [deep]
├── T22: Share portal: static HTML decompressor [visual-engineering]
├── T23: Keyboard shortcuts [quick]
├── T24: UI polish: loading, errors, responsive [visual-engineering]
└── T25: README + installation documentation [writing]

Wave 6 (After Wave 5 — advanced features, 5 parallel):
├── T26: PLANCOP_MODE env var [unspecified-high]
├── T27: Tool-specific rendering: edit diffs, create preview [deep]
├── T28: Session state: persistent server + approval tracking [deep]
├── T29: Configurable intercept list [unspecified-high]
└── T30: MCP server mode: submit_plan tool [deep]

Wave FINAL (After ALL — verification, 4 parallel):
├── F1:  Plan compliance audit [oracle]
├── F2:  Code quality review [unspecified-high]
├── F3:  Real manual QA [unspecified-high, +playwright]
└── F4:  Scope fidelity check [deep]

Critical Path: T1 → T7 → T14 → T17 → T21 → T28 → F1-F4
Max Concurrent: 6 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T6-T11 | 1 |
| T2 | — | T11 | 1 |
| T3 | — | T7, T10 | 1 |
| T4 | — | T11 | 1 |
| T5 | — | T10, T11 | 1 |
| T6 | T1 | T7-T11 | 2 |
| T7 | T1, T3, T6 | T10, T14, T16, T17 | 2 |
| T8 | T1, T6 | T17 | 2 |
| T9 | T1, T6 | T12, T13 | 2 |
| T10 | T3, T5, T7 | T14, T16 | 2 |
| T11 | T2, T4, T7, T10 | T26 | 2 |
| T12 | T9 | T14 | 3 |
| T13 | T9 | T15 | 3 |
| T14 | T7, T10, T12 | T17 | 3 |
| T15 | T13 | — | 3 |
| T16 | T7, T10 | T19 | 3 |
| T17 | T7, T8, T14 | T18, T19 | 4 |
| T18 | T17 | T19 | 4 |
| T19 | T16, T18 | T20 | 4 |
| T20 | T19 | — | 4 |
| T21 | T9 | T22 | 5 |
| T22 | T21 | — | 5 |
| T23 | T9, T14 | — | 5 |
| T24 | T9, T12, T13, T14 | — | 5 |
| T25 | ALL Waves 1-4 | — | 5 |
| T26 | T11 | T29 | 6 |
| T27 | T7, T16 | — | 6 |
| T28 | T7, T14, T17 | — | 6 |
| T29 | T11, T26 | — | 6 |
| T30 | T7 | — | 6 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

| Wave | Tasks | Categories |
|------|-------|-----------|
| 1 | 5 | T1→`deep`, T2-T5→`quick` |
| 2 | 6 | T7,T10→`deep`, T8,T11→`unspecified-high`, T6,T9→`quick` |
| 3 | 5 | T14,T16→`deep`, T12,T13→`visual-engineering`, T15→`unspecified-high` |
| 4 | 4 | T17→`deep`, T18→`unspecified-high`, T19,T20→`visual-engineering` |
| 5 | 5 | T21→`deep`, T22,T24→`visual-engineering`, T23→`quick`, T25→`writing` |
| 6 | 5 | T27,T28,T30→`deep`, T26,T29→`unspecified-high` |
| FINAL | 4 | F1→`oracle`, F2,F3→`unspecified-high`, F4→`deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

### Wave 1 — Bootstrap (5 parallel, start immediately)

- [ ] 1. Clone Plannotator + Strip Unused Apps + Flatten to Single Package

  **What to do**:
  - Clone Plannotator from `https://github.com/backnotprop/plannotator` into a temporary directory
  - Delete unused apps: `apps/opencode-plugin/`, `apps/review/`, `apps/portal/`, `apps/marketing/`
  - Delete unused packages: `packages/review-editor/`
  - Flatten monorepo into plancop repo structure:
    - `packages/ui/components/` -> `ui/src/components/`
    - `packages/ui/utils/` -> `ui/src/utils/`
    - `packages/ui/hooks/` -> `ui/src/hooks/`
    - `packages/editor/App.tsx` -> `ui/src/App.tsx`
    - `packages/editor/index.css` -> `ui/src/index.css`
    - `packages/server/` -> `server/` (keep as-is for now, port in Wave 2)
    - `apps/hook/vite.config.ts` -> `ui/vite.config.ts`
    - `apps/hook/index.tsx` -> `ui/index.tsx`
    - `apps/hook/index.html` -> `ui/index.html`
  - Remove Bun workspace config: delete `bunfig.toml`, `bun.lock`
  - Remove monorepo workspace refs from any package.json files
  - Verify directory structure matches target layout

  **Must NOT do**:
  - Do NOT port any Bun code yet (that is Wave 2)
  - Do NOT modify any TypeScript/JavaScript source files
  - Do NOT install npm dependencies (that is Wave 2)
  - Do NOT keep any OpenCode, Pi, or Claude Code specific files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful understanding of monorepo structure and file relationships to flatten correctly without losing imports or breaking references
  - **Skills**: []
    - No special skills needed — file operations only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T2, T3, T4, T5)
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T7, T8, T9, T10, T11 (all Wave 2 tasks)
  - **Blocked By**: None — can start immediately

  **References**:

  **Pattern References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/` — Source monorepo to clone and flatten
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/` — UI components to move to `ui/src/`
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/` — Server code to move to `server/`
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/editor/App.tsx` — Main app entry to move to `ui/src/App.tsx`
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/` — Hook app with vite.config.ts and index.html to reuse

  **WHY Each Reference Matters**:
  - The monorepo has `packages/*` and `apps/*` workspaces. We need to merge relevant packages into a flat structure while preserving internal import paths.
  - `packages/ui/` contains 49 files (7,305 lines) of pure React code — this is the bulk of reusable code
  - `packages/server/` contains 12 files (2,005 lines) with Bun APIs — keep file structure, port later
  - `apps/hook/` has the Vite config and HTML entry point that produces the single-file build

  **Acceptance Criteria**:
  - [ ] Plannotator cloned from GitHub (not local copy)
  - [ ] 5 unused directories deleted (opencode-plugin, review, portal, marketing, review-editor)
  - [ ] Flat structure verified: `ui/src/components/`, `ui/src/utils/`, `ui/src/hooks/`, `server/`, `ui/vite.config.ts`
  - [ ] No `bunfig.toml` or `bun.lock` in repo
  - [ ] No `packages/` or `apps/` workspace directories remain
  - [ ] `rg 'workspace' package.json` returns 0 matches (no monorepo refs)

  **QA Scenarios**:
  ```
  Scenario: Correct directory structure after flatten
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `ls ui/src/components/Viewer.tsx` — file must exist
      2. Run `ls ui/src/utils/parser.ts` — file must exist
      3. Run `ls ui/src/App.tsx` — file must exist
      4. Run `ls server/index.ts` — file must exist
      5. Run `ls ui/vite.config.ts` — file must exist
      6. Run `ls ui/index.html` — file must exist
    Expected Result: All 6 files exist at expected paths
    Failure Indicators: Any file not found
    Evidence: .sisyphus/evidence/task-1-flatten-structure.txt

  Scenario: No monorepo artifacts remain
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `ls packages/ 2>&1` — should fail (directory removed)
      2. Run `ls apps/ 2>&1` — should fail (directory removed)
      3. Run `ls bunfig.toml 2>&1` — should fail (file removed)
      4. Run `rg 'workspace' . --include='*.json' -l` — should return 0 files
    Expected Result: All checks confirm no monorepo artifacts
    Evidence: .sisyphus/evidence/task-1-no-monorepo.txt
  ```

  **Commit**: YES (end of Wave 1)
  - Message: `chore: bootstrap plancop from plannotator fork`
  - Files: entire repo structure

- [ ] 2. Copilot CLI Plugin Metadata

  **What to do**:
  - Create `plugin.json` with Copilot CLI plugin manifest:
    ```json
    {
      "name": "plancop",
      "description": "Visual plan review for Copilot CLI — annotate, approve, or deny agent plans",
      "version": "0.1.0",
      "hooks": ".github/hooks/plancop.json"
    }
    ```
  - Create `.github/hooks/plancop.json` with preToolUse hook registration:
    ```json
    {
      "version": 1,
      "hooks": {
        "preToolUse": [{
          "type": "command",
          "bash": "./scripts/plan-review.sh",
          "timeoutSec": 86400,
          "comment": "Plancop plan review — opens browser UI for edit/create tool calls"
        }]
      }
    }
    ```
  - Note: hooks go in `.github/hooks/` directory (verified against official docs), NOT project root
  - Note: `timeoutSec: 86400` (24 hours) to allow unhurried review. Default is 30s which would timeout during review.

  **Must NOT do**:
  - Do NOT put hooks.json at project root (wrong location for Copilot CLI)
  - Do NOT include matcher/filter in hooks.json (Copilot CLI does not support this)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small JSON files with well-defined schemas
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1, T3, T4, T5)
  - **Parallel Group**: Wave 1
  - **Blocks**: T11 (hook integration)
  - **Blocked By**: None

  **References**:
  - Official Copilot CLI plugin.json docs: `https://docs.github.com/en/copilot/reference/cli-plugin-reference`
  - Official hooks config docs: `https://docs.github.com/en/copilot/reference/hooks-configuration`

  **WHY Each Reference Matters**:
  - plugin.json format is specific to Copilot CLI — `name` is the only required field, but we include `description`, `version`, and `hooks` path
  - hooks.json must be `version: 1` and use the documented preToolUse schema

  **Acceptance Criteria**:
  - [ ] `plugin.json` exists at repo root with valid JSON
  - [ ] `.github/hooks/plancop.json` exists with preToolUse hook pointing to `./scripts/plan-review.sh`
  - [ ] `timeoutSec` set to 86400
  - [ ] `node -e "JSON.parse(require('fs').readFileSync('plugin.json', 'utf8'))"` succeeds

  **QA Scenarios**:
  ```
  Scenario: Plugin manifest is valid JSON
    Tool: Bash
    Steps:
      1. Run `node -e "const p=JSON.parse(require('fs').readFileSync('plugin.json','utf8')); console.log(p.name)"` 
      2. Assert output is `plancop`
    Expected Result: JSON parses, name field is 'plancop'
    Evidence: .sisyphus/evidence/task-2-plugin-json.txt

  Scenario: Hooks config is valid
    Tool: Bash
    Steps:
      1. Run `node -e "const h=JSON.parse(require('fs').readFileSync('.github/hooks/plancop.json','utf8')); console.log(h.version, h.hooks.preToolUse[0].timeoutSec)"` 
      2. Assert output is `1 86400`
    Expected Result: version is 1, timeout is 86400
    Evidence: .sisyphus/evidence/task-2-hooks-json.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `chore: bootstrap plancop from plannotator fork`
  - Files: `plugin.json`, `.github/hooks/plancop.json`

- [ ] 3. Hook Contract TypeScript Type Definitions

  **What to do**:
  - Create `src/types/hook.ts` with TypeScript interfaces for the Copilot CLI hook contract
  - Types to define:
    ```typescript
    /** stdin JSON from Copilot CLI preToolUse hook */
    interface PreToolUseInput {
      timestamp: number;       // Unix timestamp in milliseconds
      cwd: string;             // Absolute path to working directory
      toolName: string;        // 'edit' | 'create' | 'write' | 'bash' | 'read' | 'ls' | etc.
      toolArgs: string;        // JSON-encoded string (MUST double-parse)
    }
    
    /** Parsed tool arguments for edit tool */
    interface EditToolArgs {
      file: string;
      old_string: string;
      new_string: string;
    }
    
    /** Parsed tool arguments for create tool */
    interface CreateToolArgs {
      file: string;
      content: string;
    }
    
    /** stdout JSON response to Copilot CLI */
    interface HookDecision {
      permissionDecision: 'allow' | 'deny';  // Note: only 'deny' is currently processed
      permissionDecisionReason?: string;       // Required when denying
    }
    ```
  - Create `src/types/annotation.ts` with annotation types:
    ```typescript
    type AnnotationType = 'DELETION' | 'INSERTION' | 'REPLACEMENT' | 'COMMENT' | 'GLOBAL_COMMENT';
    
    interface Annotation {
      id: string;
      blockId: string;
      type: AnnotationType;
      originalText: string;
      text: string;
      startMeta: HighlightMeta;
      endMeta: HighlightMeta;
      author: string;
      createdAt: number;
    }
    ```
  - Create `src/types/plan.ts` with plan data types:
    ```typescript
    interface PlanData {
      plan: string;           // Plan markdown content (or file content for create)
      toolName: string;
      toolArgs: EditToolArgs | CreateToolArgs;
      cwd: string;
      timestamp: number;
    }
    
    interface SharePayload {
      p: string;              // Plan markdown
      a: Annotation[];        // Annotations
      t: string;              // toolName
      g: Annotation[];        // Global comments
      v: number;              // Schema version
    }
    ```
  - Create barrel export `src/types/index.ts`
  - Write TDD tests verifying type guards for PreToolUseInput validation

  **Must NOT do**:
  - Do NOT include `'ask'` as a valid permissionDecision (it is not processed by Copilot CLI)
  - Do NOT use `any` types

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions with simple type guard tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1, T2, T4, T5)
  - **Parallel Group**: Wave 1
  - **Blocks**: T7 (server port), T10 (hook integration)
  - **Blocked By**: None

  **References**:
  - Copilot CLI hooks reference: `https://docs.github.com/en/copilot/reference/hooks-configuration` — exact stdin/stdout JSON schemas
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/types.ts` — existing Plannotator annotation types to adapt

  **WHY Each Reference Matters**:
  - The hook contract types MUST match the verified Copilot CLI API exactly. `toolArgs` is a JSON string (not object) — type must reflect this.
  - Plannotator's annotation types are the starting point but need adaptation (remove Plannotator-specific fields)

  **Acceptance Criteria**:
  - [ ] TDD: Tests written first for `isValidPreToolUseInput()` type guard
  - [ ] `src/types/hook.ts`, `src/types/annotation.ts`, `src/types/plan.ts`, `src/types/index.ts` exist
  - [ ] `npx tsc --noEmit` passes with zero errors on type files
  - [ ] Type guard correctly validates well-formed and malformed hook input

  **QA Scenarios**:
  ```
  Scenario: Type guard validates correct hook input
    Tool: Bash
    Steps:
      1. Run vitest test for isValidPreToolUseInput with valid input {timestamp:123, cwd:"/tmp", toolName:"edit", toolArgs:"{}"}
      2. Assert returns true
    Expected Result: Type guard returns true for valid input
    Evidence: .sisyphus/evidence/task-3-typeguard-valid.txt

  Scenario: Type guard rejects malformed input
    Tool: Bash
    Steps:
      1. Run vitest test for isValidPreToolUseInput with {toolName:"edit"} (missing fields)
      2. Assert returns false
    Expected Result: Type guard returns false for incomplete input
    Evidence: .sisyphus/evidence/task-3-typeguard-invalid.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `chore: bootstrap plancop from plannotator fork`
  - Files: `src/types/*.ts`

- [ ] 4. Hook Entry Script Skeleton (scripts/plan-review.sh)

  **What to do**:
  - Create `scripts/plan-review.sh` (bash, chmod +x)
  - Implement the core filter logic:
    1. Read all of stdin into a variable
    2. Parse `toolName` using `node -e` (no jq dependency)
    3. Check if `toolName` is in the intercept list: `edit`, `create`, `write`
    4. If NOT in intercept list: `exit 0` silently (allows tool to proceed)
    5. Check `PLANCOP_MODE` env var: if `off`, `exit 0`
    6. Pass plan data to server via `PLAN_INPUT` env var
    7. Launch `node server/index.js` and capture its stdout
    8. Echo server's decision JSON to stdout
  - All debug logging to stderr (not stdout — stdout is reserved for decision JSON)
  - Write TDD test: mock stdin with known JSON, verify correct tool filtering

  **Must NOT do**:
  - Do NOT depend on `jq` (use `node -e` for JSON parsing)
  - Do NOT write anything to stdout except the final decision JSON
  - Do NOT intercept `read`, `ls`, `view`, `bash` by default

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small bash script (~40 lines) with clear logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1, T2, T3, T5)
  - **Parallel Group**: Wave 1
  - **Blocks**: T11 (full hook integration)
  - **Blocked By**: None

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/server/index.ts` — Plannotator hook entry point (adapt stdin reading pattern)
  - Copilot CLI preToolUse hook examples: `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks`

  **WHY Each Reference Matters**:
  - The Plannotator hook reads stdin via `Bun.stdin.text()` — we need the bash equivalent (`cat` or `read`)
  - The official docs show the recommended pattern for filtering by toolName in bash scripts

  **Acceptance Criteria**:
  - [ ] TDD: Test written first verifying `edit` is intercepted but `read` passes through
  - [ ] `scripts/plan-review.sh` exists and is executable
  - [ ] Piping `{"toolName":"read","toolArgs":"{}","cwd":"/tmp","timestamp":0}` to script exits with code 0 and no stdout
  - [ ] Piping `{"toolName":"edit",...}` to script attempts server launch (may fail without server — that is OK at this stage)
  - [ ] `PLANCOP_MODE=off` causes script to exit 0 for all tool calls

  **QA Scenarios**:
  ```
  Scenario: Non-intercepted tools pass through silently
    Tool: interactive_bash (tmux)
    Steps:
      1. Run `echo '{"toolName":"read","toolArgs":"{}","cwd":"/tmp","timestamp":0}' | bash scripts/plan-review.sh`
      2. Assert exit code is 0
      3. Assert stdout is empty (no JSON output)
    Expected Result: Script exits silently for 'read' tool
    Evidence: .sisyphus/evidence/task-4-passthrough.txt

  Scenario: PLANCOP_MODE=off disables interception
    Tool: interactive_bash (tmux)
    Steps:
      1. Run `echo '{"toolName":"edit","toolArgs":"{}","cwd":"/tmp","timestamp":0}' | PLANCOP_MODE=off bash scripts/plan-review.sh`
      2. Assert exit code is 0
      3. Assert stdout is empty
    Expected Result: Script respects PLANCOP_MODE=off
    Evidence: .sisyphus/evidence/task-4-mode-off.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `chore: bootstrap plancop from plannotator fork`
  - Files: `scripts/plan-review.sh`

- [ ] 5. Test Simulation Harness (test/simulate.sh)

  **What to do**:
  - Create `test/simulate.sh` — a test harness that simulates Copilot CLI hook invocations
  - Accepts tool name as argument: `bash test/simulate.sh edit`
  - Generates realistic mock stdin JSON for the given tool:
    - For `edit`: mock file path, old_string, new_string with sample plan content
    - For `create`: mock file path and content with sample plan
  - Pipes mock JSON into `scripts/plan-review.sh`
  - Captures and displays the decision output
  - Include several mock plan files in `test/fixtures/`:
    - `test/fixtures/sample-plan.md` — A realistic plan with headings, code blocks, mermaid diagrams
    - `test/fixtures/edit-args.json` — Sample edit tool args
    - `test/fixtures/create-args.json` — Sample create tool args
  - Write a TDD test: verify simulate.sh generates valid JSON that matches PreToolUseInput schema

  **Must NOT do**:
  - Do NOT hardcode absolute paths in fixtures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple bash script + fixture files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1, T2, T3, T4)
  - **Parallel Group**: Wave 1
  - **Blocks**: T10 (hook integration testing)
  - **Blocked By**: None

  **References**:
  - Copilot CLI preToolUse stdin schema: `https://docs.github.com/en/copilot/reference/hooks-configuration`

  **WHY Each Reference Matters**:
  - The mock JSON must exactly match the preToolUse input format. `toolArgs` must be a JSON string (double-encoded).

  **Acceptance Criteria**:
  - [ ] `test/simulate.sh` exists and is executable
  - [ ] `bash test/simulate.sh edit` generates valid JSON to stdout (before piping to hook)
  - [ ] `test/fixtures/sample-plan.md` contains headings, code blocks, and mermaid diagram
  - [ ] Mock JSON has `toolArgs` as a JSON string (not nested object)

  **QA Scenarios**:
  ```
  Scenario: Simulate generates valid hook input JSON
    Tool: Bash
    Steps:
      1. Run `bash test/simulate.sh edit --dry-run` (outputs JSON without piping to hook)
      2. Pipe output to `node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(typeof d.toolArgs)"` 
      3. Assert output is `string` (toolArgs is a JSON string, not object)
    Expected Result: Mock JSON has correct structure with string toolArgs
    Evidence: .sisyphus/evidence/task-5-simulate-json.txt
  ```

  **Commit**: YES (group with Wave 1)
  - Message: `chore: bootstrap plancop from plannotator fork`
  - Files: `test/simulate.sh`, `test/fixtures/*`

### Wave 2 — Scaffolding + Port (6 parallel, after T1 completes)

- [ ] 6. Project Scaffolding + Test Infrastructure

  **What to do**:
  - Create root `package.json` (single package, NOT monorepo workspace):
    - Name: `plancop`
    - Scripts: `build`, `dev`, `test`, `lint`
    - Dependencies from Plannotator UI: `react`, `react-dom`, `@plannotator/web-highlighter`, `highlight.js`, `mermaid`, `@pierre/diffs`, `tailwindcss`
    - Dev dependencies: `vite`, `vite-plugin-singlefile`, `vitest`, `typescript`, `@types/react`, `@types/react-dom`, `happy-dom`
    - NO server runtime dependencies
  - Create `tsconfig.json` for TypeScript compilation
  - Create `.gitignore` (node_modules, dist, .sisyphus/evidence)
  - Run `npm install` to generate lockfile
  - Configure vitest in `vitest.config.ts`:
    - Environment: `happy-dom` (for React component testing)
    - Include patterns for `**/*.test.ts` and `**/*.test.tsx`
  - Create `test/setup.ts` with vitest globals and happy-dom setup
  - Write ONE smoke test that imports a type and asserts it exists (verifies vitest works)

  **Must NOT do**:
  - Do NOT use Bun as package manager (use npm)
  - Do NOT create monorepo workspace config
  - Do NOT add runtime deps to server (zero-dep constraint)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard Node.js project scaffolding with well-known tools
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7-T11 after T1 completes)
  - **Parallel Group**: Wave 2
  - **Blocks**: All subsequent waves (provides package.json + vitest)
  - **Blocked By**: T1 (needs flattened codebase to know which deps to include)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/package.json` — UI dependencies to include
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/editor/package.json` — Editor dependencies (React, Tailwind)
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/vite.config.ts` — Vite config to adapt

  **WHY Each Reference Matters**:
  - Need exact dependency versions from Plannotator to ensure compatibility (React 19.2.3, Tailwind 4.1.18, etc.)
  - Vite config has singlefile plugin setup that we must preserve

  **Acceptance Criteria**:
  - [ ] TDD: Smoke test written first, `vitest run` executes it
  - [ ] `package.json` exists with all required deps
  - [ ] `npm install` succeeds without errors
  - [ ] `vitest run` passes (smoke test)
  - [ ] `npx tsc --noEmit` passes on type files from T3
  - [ ] No `bun.lock` or `bunfig.toml` in repo

  **QA Scenarios**:
  ```
  Scenario: npm install and vitest work
    Tool: Bash
    Steps:
      1. Run `npm install` — expect exit code 0
      2. Run `npx vitest run` — expect at least 1 test passes
      3. Run `npx tsc --noEmit` — expect exit code 0
    Expected Result: All three commands succeed
    Evidence: .sisyphus/evidence/task-6-scaffolding.txt
  ```

  **Commit**: YES (end of Wave 2)
  - Message: `feat: port server to node.js and set up build pipeline`
  - Files: `package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`

- [ ] 7. Port Server Core: Bun.serve to http.createServer

  **What to do**:
  - Rewrite `server/index.ts` to use Node.js `http.createServer()` instead of `Bun.serve()`
  - This is NOT a find-replace. Node's http module has fundamentally different ergonomics:
    - No built-in `Request`/`Response` objects — use `req`/`res` with manual body parsing
    - No `req.json()` — read body manually: `let body = ''; req.on('data', c => body += c); req.on('end', ...)`
    - No `Response.json()` — use `res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(...))`
    - No `req.formData()` — parse manually if needed
  - Implement manual JSON router for routes:
    - `GET /` — serve single-file HTML (read `ui/dist/index.html` once at startup)
    - `GET /api/status` — health check
    - `GET /api/plan` — return enriched plan data
    - `POST /api/approve` — resolve decision promise with `{permissionDecision: 'allow'}`
    - `POST /api/deny` — read body for feedback, resolve with `{permissionDecision: 'deny', permissionDecisionReason: ...}`
    - `GET /api/versions` — list plan version history (stub for now)
    - `GET /api/version/:id` — get specific version (stub for now)
  - Listen on port 0 (random available port): `server.listen(0, () => { const port = server.address().port; })`
  - Add CORS headers for local development
  - Replace `Bun.sleep()` with `new Promise(r => setTimeout(r, ms))`
  - Server lifecycle: start, wait for approve/deny, output decision to stdout, shutdown after 500ms grace
  - TDD: Write tests for each route before implementing

  **Must NOT do**:
  - Do NOT import any npm packages (zero-dep server)
  - Do NOT use Express, Fastify, Koa, or any framework
  - Do NOT hardcode port numbers
  - Do NOT write to stdout from server (only the final decision JSON)
  - Do NOT use `as any` to bypass type issues during port

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex porting task. Bun.serve and Node http.createServer have fundamentally different APIs. Every route handler needs rewriting. Budget extra time.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6, T8-T11)
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T14, T16, T17 (many features depend on working server)
  - **Blocked By**: T1 (needs server source), T3 (needs types), T6 (needs npm deps)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/index.ts` — Main Bun server (417 lines). Study Bun.serve routes, plan data handling, response patterns.
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/annotate.ts` — Annotation server (257 lines). Has approve/deny routes to port.
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/server/index.ts` — Hook-specific server. Shows stdin reading and decision output pattern.
  - Node.js `http` module docs: `https://nodejs.org/api/http.html`

  **WHY Each Reference Matters**:
  - `index.ts` has the full route table and plan data enrichment logic — port every route
  - `annotate.ts` has the approve/deny promise pattern — this is the core lifecycle (start server, wait for decision, output, shutdown)
  - `apps/hook/server/index.ts` shows how Plannotator reads stdin and outputs the decision — adapt for Copilot CLI format

  **Acceptance Criteria**:
  - [ ] TDD: Tests for GET /, GET /api/plan, POST /api/approve, POST /api/deny written first
  - [ ] Server starts on random port: `const server = http.createServer(...); server.listen(0)`
  - [ ] `curl http://127.0.0.1:PORT/api/status` returns 200 with JSON
  - [ ] `curl http://127.0.0.1:PORT/api/plan` returns plan data JSON
  - [ ] `curl -X POST http://127.0.0.1:PORT/api/approve` triggers decision output
  - [ ] `curl -X POST http://127.0.0.1:PORT/api/deny -d '{"reason":"test"}'` triggers deny output
  - [ ] Zero npm imports in server/index.ts: `rg "require\(" server/index.ts | rg -v "node:" | wc -l` returns 0
  - [ ] No Bun references: `rg 'Bun\.' server/` returns 0 matches

  **QA Scenarios**:
  ```
  Scenario: Server starts and responds to health check
    Tool: Bash
    Steps:
      1. Start server in background: `PLAN_INPUT='{"toolName":"edit","toolArgs":"{}","cwd":"/tmp","timestamp":0}' node server/index.js &`
      2. Wait 1 second for startup
      3. Read port from server stderr output (server logs port to stderr)
      4. Run `curl -s http://127.0.0.1:$PORT/api/status`
      5. Assert response contains `{"ok":true}`
    Expected Result: Server starts on random port and responds to health check
    Failure Indicators: Connection refused, non-200 status, missing JSON
    Evidence: .sisyphus/evidence/task-7-health-check.txt

  Scenario: Approve flow outputs correct decision JSON
    Tool: Bash
    Steps:
      1. Start server with mock plan input in background, capture stdout to file
      2. Run `curl -s -X POST http://127.0.0.1:$PORT/api/approve`
      3. Wait for server to exit
      4. Read captured stdout file
      5. Assert stdout is empty or contains `{"permissionDecision":"allow"}` (both valid for Copilot CLI)
    Expected Result: Server outputs allow decision and exits
    Evidence: .sisyphus/evidence/task-7-approve-flow.txt

  Scenario: Deny flow outputs structured feedback
    Tool: Bash
    Steps:
      1. Start server in background, capture stdout
      2. Run `curl -s -X POST -H 'Content-Type: application/json' -d '{"reason":"Bad plan"}' http://127.0.0.1:$PORT/api/deny`
      3. Wait for server to exit
      4. Read captured stdout
      5. Assert contains `permissionDecision` and `deny` and `Bad plan`
    Expected Result: Server outputs deny decision with reason
    Evidence: .sisyphus/evidence/task-7-deny-flow.txt
  ```

  **Commit**: YES (end of Wave 2)
  - Message: `feat: port server to node.js and set up build pipeline`
  - Files: `server/index.ts`

- [ ] 8. Port Bun Utilities: File I/O, Git, Browser, Sleep

  **What to do**:
  - Port ALL remaining Bun-specific APIs across server utility files:
  - `server/storage.ts` (101 lines):
    - `Bun.file(path).text()` -> `fs.readFileSync(path, 'utf-8')`
    - `Bun.write(path, data)` -> `fs.writeFileSync(path, data)` or `fs.promises` equivalents
  - `server/git.ts` (147 lines):
    - `$\`git ...\`` -> `child_process.execSync('git ...', { encoding: 'utf-8' })`
    - Handle errors from execSync (try/catch, not Bun's error handling)
  - `server/browser.ts` (74 lines):
    - `Bun.file(path).exists()` -> `fs.existsSync(path)`
    - Browser detection logic (find Chrome/Firefox/default browser)
    - `open` command: use `child_process.exec` with platform-aware command
  - `server/repo.ts` (114 lines): Port any Bun-specific file operations
  - `server/project.ts` (94 lines): Port any Bun-specific config loading
  - `server/image.ts` (65 lines): Port any Bun file I/O
  - Replace ALL `Bun.sleep(ms)` -> `new Promise(r => setTimeout(r, ms))`
  - TDD: Write tests for each utility function before porting

  **Must NOT do**:
  - Do NOT add npm dependencies (use Node.js built-in `fs`, `path`, `child_process`)
  - Do NOT change function signatures (keep API compatible with UI code that calls these)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple files to port, need to understand each utility's purpose and ensure behavior preservation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6, T7, T9-T11)
  - **Parallel Group**: Wave 2
  - **Blocks**: T17 (storage depends on ported file I/O)
  - **Blocked By**: T1 (needs source files), T6 (needs npm installed)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/storage.ts` — File storage with Bun.file/Bun.write
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/git.ts` — Git operations with Bun.$
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/browser.ts` — Browser detection with Bun.file
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/repo.ts` — Repo management
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/project.ts` — Project config

  **WHY Each Reference Matters**:
  - Each file uses different Bun APIs. Must map every Bun call to its Node.js equivalent without changing the function's external API.
  - `git.ts` uses Bun's shell template literal `$\`git ...\`` which has no direct equivalent — must use execSync
  - `browser.ts` detection logic is platform-specific — preserve the platform checks

  **Acceptance Criteria**:
  - [ ] TDD: Tests for readFile, writeFile, gitDiff, openBrowser written first
  - [ ] `rg 'Bun\.' server/` returns 0 matches (ALL Bun references removed)
  - [ ] `rg 'import.*from.*bun' server/` returns 0 matches
  - [ ] All utility functions maintain same exported API signatures
  - [ ] `vitest run` passes for all utility tests

  **QA Scenarios**:
  ```
  Scenario: No Bun references remain in server code
    Tool: Bash
    Steps:
      1. Run `rg 'Bun\.' server/` and `rg 'from.*bun' server/`
      2. Assert both return 0 matches
    Expected Result: Zero Bun API references in server directory
    Evidence: .sisyphus/evidence/task-8-no-bun.txt

  Scenario: Git utility works with child_process
    Tool: Bash
    Steps:
      1. Run vitest test for git.ts functions
      2. Assert git diff/log functions return strings
    Expected Result: Git utilities work with Node.js child_process
    Evidence: .sisyphus/evidence/task-8-git-utils.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat: port server to node.js and set up build pipeline`
  - Files: `server/storage.ts`, `server/git.ts`, `server/browser.ts`, `server/repo.ts`, `server/project.ts`, `server/image.ts`

- [ ] 9. Vite + Singlefile Build Pipeline Verification

  **What to do**:
  - Verify the existing Vite config (from `apps/hook/vite.config.ts`, now at `ui/vite.config.ts`) works with npm
  - Ensure `vite-plugin-singlefile` is installed and configured to inline all JS/CSS into one HTML file
  - Run `npm run build` and verify output:
    - `ui/dist/index.html` exists
    - File is self-contained (no external script/link tags)
    - Size is under 500KB
  - Fix any import path issues from the flatten operation (e.g., `@plannotator/ui` -> relative imports)
  - Update `ui/index.html` entry point if needed
  - Add `build` script to root package.json: `"build": "cd ui && vite build"`
  - Add `dev` script: `"dev": "cd ui && vite dev"`
  - TDD: Write a test that verifies the built HTML contains expected markers

  **Must NOT do**:
  - Do NOT change the UI framework (keep React)
  - Do NOT change the CSS framework (keep Tailwind)
  - Do NOT add new UI dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Existing build config just needs path fixes and verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6-T8, T10-T11)
  - **Parallel Group**: Wave 2
  - **Blocks**: T12, T13 (UI verification needs working build)
  - **Blocked By**: T1 (needs flattened UI code), T6 (needs npm deps)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/vite.config.ts` — Working singlefile Vite config
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/index.html` — Entry HTML

  **WHY Each Reference Matters**:
  - The Vite config already produces a single-file HTML. We need to verify it still works after flattening.
  - Import paths may have changed from `@plannotator/ui` workspace references to relative paths

  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds without errors
  - [ ] `ui/dist/index.html` exists and is a single file
  - [ ] File size under 500KB
  - [ ] No external `<script src=` or `<link href=` tags in built HTML
  - [ ] `npm run dev` starts Vite dev server

  **QA Scenarios**:
  ```
  Scenario: Build produces single-file HTML
    Tool: Bash
    Steps:
      1. Run `npm run build`
      2. Assert `ui/dist/index.html` exists
      3. Run `wc -c ui/dist/index.html` — assert under 512000 bytes
      4. Run `rg '<script src=' ui/dist/index.html` — assert 0 matches (all inlined)
    Expected Result: Single self-contained HTML file under 500KB
    Evidence: .sisyphus/evidence/task-9-build-output.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat: port server to node.js and set up build pipeline`
  - Files: `ui/vite.config.ts`, `ui/index.html`

- [ ] 10. Hook Integration: Stdin Parsing + Decision Output

  **What to do**:
  - Create `server/hook.ts` — the bridge between bash script and server:
    - Read `PLAN_INPUT` env var (set by plan-review.sh)
    - Parse the raw preToolUse JSON (validate with type guard from T3)
    - Double-parse `toolArgs` (it is a JSON string inside JSON)
    - Construct `PlanData` object for the UI
    - Export `getDecisionJSON(decision)` that formats the stdout output
  - Implement plan data enrichment:
    - For `edit` tool: extract `file`, `old_string`, `new_string` from toolArgs
    - For `create` tool: extract `file`, `content` from toolArgs
    - Include `cwd` for project context
  - TDD: Write tests for stdin parsing, toolArgs double-parse, decision formatting

  **Must NOT do**:
  - Do NOT echo `{"permissionDecision":"ask"}` (not processed by Copilot CLI)
  - Do NOT assume toolArgs is an object (it is ALWAYS a JSON string)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The toolArgs double-parse is a documented gotcha. Must handle malformed JSON gracefully.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6-T9, T11)
  - **Parallel Group**: Wave 2
  - **Blocks**: T14 (approve/deny flow), T16 (plan enrichment)
  - **Blocked By**: T3 (types), T5 (simulate harness for testing), T7 (server core)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/hook/server/index.ts` — How Plannotator reads stdin and outputs decision (Bun.stdin pattern)
  - Copilot CLI preToolUse stdin format: `https://docs.github.com/en/copilot/reference/hooks-configuration`

  **WHY Each Reference Matters**:
  - Plannotator reads stdin via `Bun.stdin.text()`. We use `PLAN_INPUT` env var instead (bash script reads stdin, passes via env).
  - The official docs confirm `toolArgs` is a JSON string requiring double-parse.

  **Acceptance Criteria**:
  - [ ] TDD: Tests for parsePreToolUseInput(), parseToolArgs(), getDecisionJSON() written first
  - [ ] Double-parse correctly extracts edit/create args from JSON string
  - [ ] Malformed toolArgs returns graceful error (not crash)
  - [ ] `getDecisionJSON('allow')` returns valid JSON with `permissionDecision`
  - [ ] `getDecisionJSON('deny', 'reason')` includes `permissionDecisionReason`

  **QA Scenarios**:
  ```
  Scenario: toolArgs double-parse works correctly
    Tool: Bash
    Steps:
      1. Run vitest test with input: toolArgs = '{"file":"src/app.ts","old_string":"foo","new_string":"bar"}'
      2. Assert parsed result has file='src/app.ts', old_string='foo', new_string='bar'
    Expected Result: Double-parse extracts structured data from JSON string
    Evidence: .sisyphus/evidence/task-10-double-parse.txt

  Scenario: Malformed toolArgs handled gracefully
    Tool: Bash
    Steps:
      1. Run vitest test with input: toolArgs = 'not valid json'
      2. Assert function returns error object (not throws)
    Expected Result: Graceful error handling for malformed JSON
    Evidence: .sisyphus/evidence/task-10-malformed.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat: port server to node.js and set up build pipeline`
  - Files: `server/hook.ts`

- [ ] 11. Adapt Hook Entry Script with Server Launch

  **What to do**:
  - Update `scripts/plan-review.sh` (from T4) to wire everything together:
    - After filtering (edit/create only), set `PLAN_INPUT` env var with raw stdin JSON
    - Launch `node server/index.js` in foreground
    - Server writes decision JSON to a temp file (not stdout directly, to avoid mixing with server debug output)
    - Script reads temp file and echoes to stdout
    - Clean up temp file
  - Handle browser opening:
    - Server outputs port number to stderr
    - Script reads port from stderr, opens browser via `xdg-open` / `open` / fallback to printing URL
  - Handle `PLANCOP_PORT` env var for pinning port (testing)
  - TDD: Integration test using simulate.sh + server

  **Must NOT do**:
  - Do NOT mix server debug output with decision JSON on stdout
  - Do NOT leave temp files on error (use trap for cleanup)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration task connecting bash script, Node server, and browser. Multiple moving parts.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6-T10)
  - **Parallel Group**: Wave 2
  - **Blocks**: T26 (PLANCOP_MODE)
  - **Blocked By**: T2 (plugin config), T4 (script skeleton), T7 (server), T10 (hook parsing)

  **References**:
  - `scripts/plan-review.sh` (from T4) — Skeleton to extend
  - `server/index.ts` (from T7) — Server that will be launched
  - `server/hook.ts` (from T10) — Hook parsing module

  **Acceptance Criteria**:
  - [ ] `bash test/simulate.sh edit` starts server and opens browser (or prints URL)
  - [ ] Server stdout captured correctly (decision JSON only)
  - [ ] Temp files cleaned up after run
  - [ ] `PLANCOP_PORT=9999` pins port to 9999

  **QA Scenarios**:
  ```
  Scenario: End-to-end hook with simulate.sh
    Tool: interactive_bash (tmux)
    Steps:
      1. Run `bash test/simulate.sh edit` in tmux
      2. Wait for browser URL to appear in stderr
      3. Use curl to POST approve to the server
      4. Verify script outputs decision JSON to stdout and exits
    Expected Result: Full hook lifecycle works end-to-end
    Evidence: .sisyphus/evidence/task-11-e2e-hook.txt
  ```

  **Commit**: YES (group with Wave 2)
  - Message: `feat: port server to node.js and set up build pipeline`
  - Files: `scripts/plan-review.sh`

### Wave 3 — Core UI Features (5 parallel, after Wave 2)

- [ ] 12. Verify/Adapt Markdown Rendering Pipeline

  **What to do**:
  - Verify `Viewer.tsx` renders plan markdown correctly after flatten:
    - Fix import paths (any `@plannotator/*` workspace refs -> relative)
    - Verify `parser.ts` converts markdown to Block[] (headings, lists, code, tables, blockquotes, mermaid)
    - Verify `highlight.js` applies syntax highlighting to code blocks
    - Verify `MermaidBlock.tsx` renders mermaid diagrams
  - Test with the sample plan from `test/fixtures/sample-plan.md`
  - Ensure dark theme styles render correctly (Tailwind dark mode)
  - TDD: Write component tests with happy-dom verifying each block type renders

  **Must NOT do**:
  - Do NOT rewrite the parser (it works, just fix imports)
  - Do NOT change the rendering logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI rendering verification requires visual inspection and DOM assertions
  - **Skills**: [`playwright`]
    - `playwright`: For visual verification of rendered markdown in browser

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T13-T16)
  - **Parallel Group**: Wave 3
  - **Blocks**: T14 (approve/deny needs working UI)
  - **Blocked By**: T9 (needs working Vite build)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/components/Viewer.tsx` — Main plan renderer with web-highlighter integration
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/utils/parser.ts` — Markdown-to-Block[] parser (~300 lines)
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/components/MermaidBlock.tsx` — Mermaid diagram renderer

  **Acceptance Criteria**:
  - [ ] TDD: Component tests for heading, code block, mermaid, table rendering
  - [ ] `npm run build` succeeds with Viewer component included
  - [ ] No `@plannotator/*` import paths remain: `rg '@plannotator' ui/src/` returns 0 (except web-highlighter npm pkg)
  - [ ] Sample plan with code blocks and mermaid diagram renders in browser

  **QA Scenarios**:
  ```
  Scenario: Markdown renders with all block types
    Tool: Playwright
    Steps:
      1. Start dev server: `npm run dev`
      2. Navigate to http://localhost:5173
      3. Wait for `.plan-viewer` selector
      4. Assert heading elements exist: `h1, h2, h3`
      5. Assert code blocks have syntax highlighting: `.hljs` class present
      6. Screenshot full page
    Expected Result: All markdown block types render with proper styling
    Evidence: .sisyphus/evidence/task-12-markdown-render.png
  ```

  **Commit**: YES (end of Wave 3)
  - Message: `feat: core plan review UI with annotation support`
  - Files: `ui/src/components/Viewer.tsx`, `ui/src/utils/parser.ts`

- [ ] 13. Verify/Adapt Annotation Engine

  **What to do**:
  - Verify `@plannotator/web-highlighter` npm package works (it has zero Bun deps)
  - Verify `AnnotationToolbar.tsx` appears on text selection with 4 options: Delete, Insert, Replace, Comment
  - Verify `AnnotationPanel.tsx` shows annotation list in sidebar
  - Fix any import paths from flatten
  - Verify annotation state management (useAnnotations hook or equivalent)
  - Test all 5 annotation types: DELETION, INSERTION, REPLACEMENT, COMMENT, GLOBAL_COMMENT
  - TDD: Write tests for annotation CRUD (create, read, update, delete)

  **Must NOT do**:
  - Do NOT rewrite the web-highlighter (use npm package as-is)
  - Do NOT change annotation types

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Annotation engine involves complex DOM manipulation and text selection
  - **Skills**: [`playwright`]
    - `playwright`: For testing text selection and annotation toolbar appearance

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T12, T14-T16)
  - **Parallel Group**: Wave 3
  - **Blocks**: T15 (feedback format needs annotation data)
  - **Blocked By**: T9 (needs working Vite build)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/components/AnnotationToolbar.tsx` — Toolbar that appears on text selection
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/components/AnnotationPanel.tsx` — Sidebar annotation list
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/utils/annotationHelpers.ts` — Annotation utility functions

  **Acceptance Criteria**:
  - [ ] TDD: Tests for createAnnotation, deleteAnnotation, exportAnnotations
  - [ ] Text selection triggers annotation toolbar with 4 action buttons
  - [ ] Each annotation type creates correct data structure
  - [ ] Annotations appear in sidebar panel
  - [ ] Annotations can be edited and deleted

  **QA Scenarios**:
  ```
  Scenario: Text selection shows annotation toolbar
    Tool: Playwright
    Steps:
      1. Start dev server, navigate to page
      2. Select text in plan viewer by clicking and dragging
      3. Assert annotation toolbar appears with buttons: Delete, Insert, Replace, Comment
      4. Click 'Comment' button
      5. Type 'Test comment' in the input
      6. Submit annotation
      7. Assert annotation appears in sidebar panel
    Expected Result: Full annotation creation flow works
    Evidence: .sisyphus/evidence/task-13-annotation-flow.png
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat: core plan review UI with annotation support`
  - Files: `ui/src/components/AnnotationToolbar.tsx`, `ui/src/components/AnnotationPanel.tsx`

- [ ] 14. Approve/Deny Flow: UI Buttons to Server to Stdout

  **What to do**:
  - Wire `Header.tsx` Approve and Deny buttons to server API:
    - Approve button: `POST /api/approve` -> server outputs allow decision -> exits
    - Deny button: collect all annotations + global comments, `POST /api/deny` with feedback -> server outputs deny -> exits
  - Implement the deny payload construction:
    - Gather all annotations from annotation state
    - Gather global comment text
    - Format into structured feedback string (see T15)
    - POST to `/api/deny` with `{reason: formattedFeedback}`
  - Handle UI state transitions:
    - Loading -> Reviewing -> Approved/Denied (see state machine in spec)
    - Show confirmation after approve/deny before closing tab
  - Close browser tab after decision (or show 'You can close this tab' message)
  - TDD: Integration test verifying full approve and deny flows

  **Must NOT do**:
  - Do NOT auto-close tab without user seeing confirmation
  - Do NOT allow approving/denying without the plan being fully loaded

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration task connecting UI state, annotation data, server API, and stdout output. Multiple failure points.
  - **Skills**: [`playwright`]
    - `playwright`: For testing the full approve/deny flow in browser

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T12, T13, T15, T16)
  - **Parallel Group**: Wave 3
  - **Blocks**: T17 (storage needs working approve/deny flow)
  - **Blocked By**: T7 (server), T10 (hook integration), T12 (UI rendering)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/components/` — Existing UI components for approve/deny buttons
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/annotate.ts` — Server-side approve/deny route handling

  **Acceptance Criteria**:
  - [ ] TDD: Tests for approve POST, deny POST with feedback payload
  - [ ] Clicking Approve makes POST /api/approve and shows confirmation
  - [ ] Clicking Deny collects annotations, formats feedback, POSTs to /api/deny
  - [ ] Server exits after receiving decision
  - [ ] stdout contains correct decision JSON

  **QA Scenarios**:
  ```
  Scenario: Full approve flow in browser
    Tool: Playwright
    Steps:
      1. Start server with mock plan input
      2. Navigate to review UI
      3. Click the Approve button (selector: button containing 'Approve')
      4. Assert confirmation message appears
      5. Check server stdout file for decision JSON
    Expected Result: Approve flow completes, server outputs allow decision
    Evidence: .sisyphus/evidence/task-14-approve.png

  Scenario: Full deny flow with annotations
    Tool: Playwright + Bash
    Steps:
      1. Start server, navigate to UI
      2. Add a comment annotation on some text
      3. Type global feedback in the global comment input
      4. Click Deny button
      5. Check server stdout file for deny decision with feedback
      6. Assert feedback contains the comment text and global feedback
    Expected Result: Deny includes structured annotation feedback
    Evidence: .sisyphus/evidence/task-14-deny.png
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat: core plan review UI with annotation support`
  - Files: `ui/src/components/Header.tsx`, `ui/src/App.tsx`

- [ ] 15. Feedback Format: Annotations to Structured Deny Reason

  **What to do**:
  - Create `ui/src/utils/feedback.ts` — converts annotations to LLM-readable feedback string:
    ```
    PLAN REVIEW FEEDBACK
    ====================
    
    ## Annotations (N)
    
    ### DELETION (line X-Y)
    > [selected text]
    Reviewer wants this section removed.
    
    ### REPLACEMENT (line X)
    > [original text]
    Replace with: "[replacement text]"
    
    ### COMMENT (line X-Y)
    > [selected text]
    "[comment text]"
    
    ## Global Feedback
    - [global comment text]
    ```
  - Each annotation formatted with its type icon, line reference, selected text, and action/comment
  - Format must be readable by LLMs (structured, not HTML/JSON)
  - TDD: Write tests with sample annotations, verify output format

  **Must NOT do**:
  - Do NOT use HTML or JSON format (plain text for LLM readability)
  - Do NOT include implementation details in feedback (only reviewer intent)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: String formatting with multiple annotation types and edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T12-T14, T16)
  - **Parallel Group**: Wave 3
  - **Blocks**: None (consumed by T14 deny flow)
  - **Blocked By**: T13 (needs annotation data structure)

  **References**:
  - Parchmark spec Section 5.6 (Feedback Format) — Exact format to implement
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/utils/annotationHelpers.ts` — Existing annotation export helpers

  **Acceptance Criteria**:
  - [ ] TDD: Tests for formatFeedback() with 0, 1, and 5 annotations
  - [ ] Deletion annotation formatted with selected text and removal message
  - [ ] Replacement formatted with original and replacement text
  - [ ] Comment formatted with quoted text and reviewer comment
  - [ ] Global comments appended at end
  - [ ] Empty annotations produce clean output (not "0 annotations")

  **QA Scenarios**:
  ```
  Scenario: Feedback format with mixed annotations
    Tool: Bash
    Steps:
      1. Run vitest test with 3 annotations (deletion, replacement, comment) + 1 global
      2. Assert output contains all 3 annotation sections and global feedback
      3. Assert format matches spec: headers, quoted text, action descriptions
    Expected Result: Structured, LLM-readable feedback string
    Evidence: .sisyphus/evidence/task-15-feedback-format.txt
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat: core plan review UI with annotation support`
  - Files: `ui/src/utils/feedback.ts`

- [ ] 16. Plan Data Enrichment: toolArgs Parsing + Diffs

  **What to do**:
  - Create `server/enrichment.ts` — enriches raw hook input into rich plan data for the UI:
    - Parse `toolArgs` JSON string into structured object (using types from T3)
    - For `edit` tool: generate line-level diff between `old_string` and `new_string` using `@pierre/diffs` library
    - For `create` tool: format file content with syntax highlighting hints (file extension for language detection)
    - Include `cwd` for project path display
    - If previous versions exist in storage, include diff against last version
  - Wire enrichment into `/api/plan` route response
  - TDD: Write tests for edit diff generation and create file formatting

  **Must NOT do**:
  - Do NOT import `@pierre/diffs` in server (zero-dep constraint) — do the diff in the UI or use a simple inline diff
  - Actually, `@pierre/diffs` is a UI dependency — server should send raw old/new strings, UI does the diff

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Bridge between server and UI data flow. Must understand both sides.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T12-T15)
  - **Parallel Group**: Wave 3
  - **Blocks**: T19 (diff viewer needs enriched data)
  - **Blocked By**: T7 (server), T10 (hook parsing)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/index.ts` — How Plannotator enriches plan data
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/utils/parser.ts` — How UI parses plan markdown

  **Acceptance Criteria**:
  - [ ] TDD: Tests for enrichEditTool(), enrichCreateTool()
  - [ ] Edit enrichment includes file path, old_string, new_string
  - [ ] Create enrichment includes file path and content
  - [ ] `/api/plan` returns enriched data structure
  - [ ] Malformed toolArgs returns graceful error in response

  **QA Scenarios**:
  ```
  Scenario: Edit tool enrichment includes diff data
    Tool: Bash
    Steps:
      1. Start server with edit tool mock data
      2. `curl http://127.0.0.1:$PORT/api/plan`
      3. Assert response JSON has `toolArgs.file`, `toolArgs.old_string`, `toolArgs.new_string`
    Expected Result: Enriched plan data has structured edit info
    Evidence: .sisyphus/evidence/task-16-edit-enrichment.txt
  ```

  **Commit**: YES (group with Wave 3)
  - Message: `feat: core plan review UI with annotation support`
  - Files: `server/enrichment.ts`

### Wave 4 — Version History + Diff (4 parallel, after Wave 3)

- [ ] 17. Storage Module: ~/.plancop/history/

  **What to do**:
  - Create `storage/index.js` (Node.js, zero deps) — plan version history on local filesystem:
    - Save path: `~/.plancop/history/{project-slug}/{plan-slug}/{version}.md`
    - `savePlan(cwd, content)` — auto-generates project slug from cwd basename, plan slug from content (first heading or first 50 chars, kebab-cased)
    - `getVersions(cwd)` — list all versions for current project
    - `getVersion(cwd, versionId)` — get specific version content
    - Content hash deduplication: don't save if content hash matches previous version
    - Auto-increment version numbers: v1, v2, v3...
  - Wire into server: save plan on first `/api/plan` request
  - Wire `/api/versions` and `/api/version/:id` server routes
  - TDD: Write tests for save, load, dedup, slug generation

  **Must NOT do**:
  - Do NOT use npm dependencies (Node.js fs/path/crypto built-ins only)
  - Do NOT store annotations in version history (only plan content)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: File system operations with slug generation, dedup hashing, and directory management. Edge cases around concurrent writes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18-T20)
  - **Parallel Group**: Wave 4
  - **Blocks**: T18 (versioning depends on storage), T19 (diff viewer needs versions)
  - **Blocked By**: T7 (server core), T8 (ported file I/O), T14 (approve/deny flow)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/server/storage.ts` — Plannotator storage (101 lines, uses Bun.file/write)
  - Parchmark spec Section 5 (Plan Version History) — Storage path convention and slug generation

  **Acceptance Criteria**:
  - [ ] TDD: Tests for savePlan(), getVersions(), getVersion(), dedup
  - [ ] Plans save to `~/.plancop/history/` with correct directory structure
  - [ ] Duplicate content is not saved (hash check)
  - [ ] Version numbering auto-increments
  - [ ] `GET /api/versions` returns list of versions
  - [ ] `GET /api/version/1` returns version content

  **QA Scenarios**:
  ```
  Scenario: Plan saves and deduplicates correctly
    Tool: Bash
    Steps:
      1. Run vitest tests for storage module
      2. Assert savePlan creates file at expected path
      3. Call savePlan with same content twice
      4. Assert only 1 version file exists (dedup)
      5. Call savePlan with different content
      6. Assert 2 version files exist
    Expected Result: Storage saves new versions, deduplicates identical content
    Evidence: .sisyphus/evidence/task-17-storage.txt
  ```

  **Commit**: YES (end of Wave 4)
  - Message: `feat: plan version history and diff viewer`
  - Files: `storage/index.js`

- [ ] 18. Plan Versioning: Auto-Save + Dedup + Slug Generation

  **What to do**:
  - Implement slug generation utilities:
    - `projectSlug(cwd)`: basename of cwd, kebab-cased (`/home/user/my-project` -> `my-project`)
    - `planSlug(content)`: first H1 heading or first 50 chars, kebab-cased (`# Auth Refactor Plan` -> `auth-refactor-plan`)
  - Implement content hash for dedup: `crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)`
  - Auto-save lifecycle: server saves plan on first `/api/plan` request (not on startup — wait for UI to fetch)
  - Wire everything into the storage module from T17
  - TDD: Tests for slug generation edge cases, hash dedup

  **Must NOT do**:
  - Do NOT save plan until UI requests it (avoid premature saves on passthrough tools)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: String manipulation, hashing, integration with storage module
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T17, T19, T20)
  - **Parallel Group**: Wave 4
  - **Blocks**: T19 (diff viewer needs version IDs)
  - **Blocked By**: T17 (storage module)

  **References**:
  - Parchmark spec Section 5 — Slug generation rules and dedup logic

  **Acceptance Criteria**:
  - [ ] TDD: Tests for projectSlug(), planSlug(), contentHash()
  - [ ] Slugs handle special chars: `My Cool Project!!` -> `my-cool-project`
  - [ ] Plans without headings use first 50 chars for slug
  - [ ] Content hash is deterministic (same content = same hash)

  **QA Scenarios**:
  ```
  Scenario: Slug generation handles edge cases
    Tool: Bash
    Steps:
      1. Run vitest tests for slug generation with various inputs
      2. Assert special chars stripped, spaces become hyphens, lowercase
    Expected Result: Robust slug generation
    Evidence: .sisyphus/evidence/task-18-slugs.txt
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat: plan version history and diff viewer`
  - Files: `storage/index.js`, `server/enrichment.ts`

- [ ] 19. PlanDiffViewer: Version Comparison UI

  **What to do**:
  - Create or adapt `ui/src/components/PlanDiffViewer.tsx`:
    - Fetch two versions from `/api/version/:id`
    - Compute line-level diff using `@pierre/diffs` library
    - Render diff with added (green), removed (red), unchanged styling
    - Support both inline and side-by-side views
  - Create `usePlanDiff.ts` hook for diff state management
  - TDD: Write tests for diff computation and rendering

  **Must NOT do**:
  - Do NOT implement diff algorithm from scratch (use @pierre/diffs)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Diff visualization with color-coded changes requires careful UI work
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T17, T18, T20)
  - **Parallel Group**: Wave 4
  - **Blocks**: T20 (version selector needs diff viewer)
  - **Blocked By**: T16 (enrichment provides data), T18 (versioning provides IDs)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/utils/` — Existing planDiffEngine if present
  - `@pierre/diffs` npm package — Diff computation library used by Plannotator

  **Acceptance Criteria**:
  - [ ] TDD: Tests for diff rendering with added, removed, unchanged lines
  - [ ] Diff viewer shows changes between two plan versions
  - [ ] Added lines highlighted green, removed lines highlighted red
  - [ ] Side-by-side view works

  **QA Scenarios**:
  ```
  Scenario: Diff viewer shows version changes
    Tool: Playwright
    Steps:
      1. Set up two plan versions with known differences
      2. Open diff viewer in browser
      3. Assert green-highlighted lines exist (additions)
      4. Assert red-highlighted lines exist (removals)
    Expected Result: Visual diff between plan versions
    Evidence: .sisyphus/evidence/task-19-diff-viewer.png
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat: plan version history and diff viewer`
  - Files: `ui/src/components/PlanDiffViewer.tsx`, `ui/src/hooks/usePlanDiff.ts`

- [ ] 20. Version Selector + Header Integration

  **What to do**:
  - Add version selector dropdown to `Header.tsx`:
    - Fetch versions from `/api/versions`
    - Show dropdown with version numbers and timestamps
    - Selecting a version opens diff viewer between that version and current
  - Add 'Compare' button in header that opens PlanDiffViewer
  - Wire version count indicator (e.g., 'v3' badge)
  - TDD: Component test for dropdown rendering and selection

  **Must NOT do**:
  - Do NOT show version selector when only 1 version exists (no comparison possible)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component integration with header layout
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T17-T19)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T19 (diff viewer component)

  **References**:
  - Parchmark spec Section 5.4 (App.tsx UI Layout) — Header layout with Compare button

  **Acceptance Criteria**:
  - [ ] Version dropdown appears when 2+ versions exist
  - [ ] Selecting a version opens diff view
  - [ ] Version badge shows current version number

  **QA Scenarios**:
  ```
  Scenario: Version selector with multiple versions
    Tool: Playwright
    Steps:
      1. Set up plan with 2 versions
      2. Open review UI
      3. Assert version dropdown is visible
      4. Click dropdown, select version 1
      5. Assert diff viewer opens
    Expected Result: Version comparison works from header
    Evidence: .sisyphus/evidence/task-20-version-selector.png
  ```

  **Commit**: YES (group with Wave 4)
  - Message: `feat: plan version history and diff viewer`
  - Files: `ui/src/components/Header.tsx`

### Wave 5 — Sharing + Polish (5 parallel, after Wave 4)

- [ ] 21. URL Sharing: Deflate + Base64url Compression

  **What to do**:
  - Port/verify `ui/src/utils/sharing.ts`:
    - `compressPayload(payload: SharePayload)`: JSON.stringify -> TextEncoder -> CompressionStream('deflate-raw') -> base64url encode -> URL hash
    - `decompressPayload(hash: string)`: base64url decode -> DecompressionStream('deflate-raw') -> TextDecoder -> JSON.parse -> SharePayload
  - SharePayload includes: plan markdown, annotations, toolName, global comments, schema version
  - Generate share URL: `https://share.plancop.dev/#<compressed>`
  - Add share button to Header.tsx
  - Copy URL to clipboard on click
  - TDD: Write round-trip tests (compress -> decompress -> verify equality)

  **Must NOT do**:
  - Do NOT require a backend for sharing (all client-side)
  - Do NOT use external compression libraries (use browser's CompressionStream API)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Compression pipeline with binary data handling, base64url encoding, and cross-browser compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T22-T25)
  - **Parallel Group**: Wave 5
  - **Blocks**: T22 (share portal needs same decompression)
  - **Blocked By**: T9 (needs working UI build)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/utils/sharing.ts` — Existing sharing implementation to port
  - Parchmark spec Section 6 (URL Sharing) — SharePayload schema and compression flow

  **Acceptance Criteria**:
  - [ ] TDD: Round-trip test: compress(payload) -> decompress -> deepEqual(payload)
  - [ ] Share URL generated with base64url-encoded hash
  - [ ] URL can be decoded back to original plan + annotations
  - [ ] Clipboard copy works on share button click

  **QA Scenarios**:
  ```
  Scenario: Share URL round-trip
    Tool: Bash
    Steps:
      1. Run vitest test that compresses a sample plan with annotations
      2. Decompress the result
      3. Assert original and decompressed are deeply equal
    Expected Result: Lossless compression round-trip
    Evidence: .sisyphus/evidence/task-21-sharing-roundtrip.txt
  ```

  **Commit**: YES (end of Wave 5)
  - Message: `feat: url sharing, keyboard shortcuts, and polish`
  - Files: `ui/src/utils/sharing.ts`

- [ ] 22. Share Portal: Static HTML Decompressor Page

  **What to do**:
  - Create `portal/index.html` — a standalone static HTML page:
    - Reads URL hash fragment on load
    - Decompresses using same algorithm as T21
    - Renders plan markdown with annotations (read-only, no editing)
    - Self-contained: all JS/CSS inlined
  - Can be hosted on any static host (GitHub Pages, Netlify, etc.)
  - Uses same markdown parser and annotation rendering as main UI (but read-only)
  - TDD: Test that portal correctly decompresses and renders a known URL hash

  **Must NOT do**:
  - Do NOT require a backend
  - Do NOT include approve/deny buttons (read-only view)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Standalone HTML page with rendering
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21, T23-T25)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: T21 (needs decompression implementation)

  **References**:
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/portal/` — Existing portal implementation
  - T21 sharing.ts — Decompression algorithm to match

  **Acceptance Criteria**:
  - [ ] `portal/index.html` exists as self-contained HTML
  - [ ] Opens share URL hash and renders plan + annotations
  - [ ] No approve/deny buttons visible
  - [ ] Works offline (self-contained)

  **QA Scenarios**:
  ```
  Scenario: Portal decompresses share URL
    Tool: Playwright
    Steps:
      1. Open portal/index.html with a known compressed hash
      2. Assert plan markdown renders
      3. Assert annotations are visible
    Expected Result: Shared plan renders correctly in portal
    Evidence: .sisyphus/evidence/task-22-portal.png
  ```

  **Commit**: YES (group with Wave 5)
  - Message: `feat: url sharing, keyboard shortcuts, and polish`
  - Files: `portal/index.html`

- [ ] 23. Keyboard Shortcuts

  **What to do**:
  - Implement keyboard shortcuts in the React app:
    - `Cmd+Enter` (Mac) / `Ctrl+Enter` (Win/Linux): Approve
    - `Cmd+Shift+Enter` / `Ctrl+Shift+Enter`: Deny (with current annotations)
    - `Escape`: Cancel current annotation selection
    - `Cmd+S` / `Ctrl+S`: Prevent browser save, maybe trigger share
  - Add keyboard shortcut hints to button tooltips
  - TDD: Test that keydown events trigger correct actions

  **Must NOT do**:
  - Do NOT override standard browser shortcuts beyond the listed ones

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple event listener setup with well-defined shortcuts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21, T22, T24, T25)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: T9 (needs working UI), T14 (needs approve/deny wired)

  **Acceptance Criteria**:
  - [ ] TDD: Keyboard event tests for each shortcut
  - [ ] Cmd+Enter triggers approve flow
  - [ ] Cmd+Shift+Enter triggers deny flow
  - [ ] Escape cancels annotation toolbar

  **QA Scenarios**:
  ```
  Scenario: Keyboard shortcuts work
    Tool: Playwright
    Steps:
      1. Open review UI
      2. Press Cmd+Enter
      3. Assert approve flow triggered
    Expected Result: Keyboard shortcuts trigger correct actions
    Evidence: .sisyphus/evidence/task-23-shortcuts.txt
  ```

  **Commit**: YES (group with Wave 5)
  - Message: `feat: url sharing, keyboard shortcuts, and polish`
  - Files: `ui/src/App.tsx`

- [ ] 24. UI Polish: Loading States, Error Handling, Responsive Layout

  **What to do**:
  - Add loading spinner/skeleton while plan data loads from `/api/plan`
  - Add error state if `/api/plan` fails or returns invalid data
  - Add error boundary for React component crashes
  - Handle edge cases: empty plan, plan with no code blocks, plan with only mermaid
  - Make layout responsive: sidebar collapses on narrow screens
  - Ensure dark theme is consistent across all components
  - TDD: Tests for loading state, error state, empty plan rendering

  **Must NOT do**:
  - Do NOT add a light theme (dark only, terminal aesthetic)
  - Do NOT over-animate (keep it snappy)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual polish, responsive design, and error states
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21-T23, T25)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: T9 (build), T12 (rendering), T13 (annotations), T14 (approve/deny)

  **References**:
  - Parchmark spec Section 5.4 (UI Layout) — Target layout diagram

  **Acceptance Criteria**:
  - [ ] Loading spinner shows while fetching plan
  - [ ] Error message shows if server unreachable
  - [ ] Empty plan renders gracefully (not blank screen)
  - [ ] Layout works on 1024px, 1440px, and 1920px widths

  **QA Scenarios**:
  ```
  Scenario: Loading and error states
    Tool: Playwright
    Steps:
      1. Open UI without server running
      2. Assert error state renders (not blank screen)
      3. Start server, refresh
      4. Assert loading spinner appears briefly, then plan renders
    Expected Result: Graceful loading and error handling
    Evidence: .sisyphus/evidence/task-24-polish.png
  ```

  **Commit**: YES (group with Wave 5)
  - Message: `feat: url sharing, keyboard shortcuts, and polish`
  - Files: `ui/src/App.tsx`, `ui/src/components/*.tsx`

- [ ] 25. README + Installation Documentation

  **What to do**:
  - Write comprehensive `README.md` covering:
    - What Plancop does (1-paragraph overview)
    - Installation methods:
      1. Plugin install: `copilot plugin install OWNER/REPO`
      2. Manual: clone repo, build UI, add hooks.json to project
      3. Global: npm install -g plancop
    - Usage: how the hook fires, what the UI looks like, how to approve/deny
    - Configuration: PLANCOP_MODE env var, PLANCOP_PORT, intercept list
    - Development: npm install, npm run dev, npm test
    - Architecture: brief overview of hook -> server -> browser flow
  - Add LICENSE file (MIT)

  **Must NOT do**:
  - Do NOT use emojis in documentation (unless user explicitly requests)
  - Do NOT over-document implementation details (focus on user-facing info)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T21-T24)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: All Waves 1-4 (needs complete understanding of built system)

  **Acceptance Criteria**:
  - [ ] README.md exists with installation, usage, and configuration sections
  - [ ] LICENSE file exists (MIT)
  - [ ] All three installation methods documented

  **QA Scenarios**:
  ```
  Scenario: README has required sections
    Tool: Bash
    Steps:
      1. `rg '## Installation' README.md` — assert match
      2. `rg '## Usage' README.md` — assert match
      3. `rg '## Configuration' README.md` — assert match
      4. `ls LICENSE` — assert exists
    Expected Result: README has all required sections
    Evidence: .sisyphus/evidence/task-25-readme.txt
  ```

  **Commit**: YES (group with Wave 5)
  - Message: `feat: url sharing, keyboard shortcuts, and polish`
  - Files: `README.md`, `LICENSE`

### Wave 6 — Advanced Features (5 parallel, after Wave 5)

- [ ] 26. PLANCOP_MODE Environment Variable

  **What to do**:
  - Implement `PLANCOP_MODE` in `scripts/plan-review.sh`:
    - `off`: All tools pass through, hook is disabled
    - `auto` (default): Intercept edit, create, write only
    - `always`: Intercept all tool calls including read and ls
    - `aggressive`: Intercept bash commands too (show command for review)
  - Update tool filtering logic based on mode
  - TDD: Test each mode with different tool types

  **Must NOT do**:
  - Do NOT make `aggressive` the default (too intrusive)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T27-T30)
  - **Parallel Group**: Wave 6
  - **Blocks**: T29 (config list needs mode logic)
  - **Blocked By**: T11 (hook script)

  **References**:
  - `scripts/plan-review.sh` (from T4/T11) — Script to extend with mode checks
  - Parchmark spec Section 9 (Build Phase 6) — Mode descriptions

  **Acceptance Criteria**:
  - [ ] TDD: Tests for each mode with edit, read, bash tools
  - [ ] `PLANCOP_MODE=off` passes all tools through
  - [ ] `PLANCOP_MODE=auto` intercepts edit/create/write only
  - [ ] `PLANCOP_MODE=always` intercepts all tools
  - [ ] `PLANCOP_MODE=aggressive` intercepts bash commands too

  **QA Scenarios**:
  ```
  Scenario: Mode switching works
    Tool: interactive_bash (tmux)
    Steps:
      1. Run simulate with PLANCOP_MODE=off and edit tool, assert passthrough
      2. Run simulate with PLANCOP_MODE=auto and read tool, assert passthrough
      3. Run simulate with PLANCOP_MODE=aggressive and bash tool, assert intercepted
    Expected Result: Each mode filters tools correctly
    Evidence: .sisyphus/evidence/task-26-modes.txt
  ```

  **Commit**: YES (end of Wave 6)
  - Message: `feat: advanced features (mode, session, mcp)`
  - Files: `scripts/plan-review.sh`

- [ ] 27. Tool-Specific Rendering: Edit Diffs, Create Preview

  **What to do**:
  - Enhance the plan review UI with tool-specific displays:
    - For `edit` tool: show file path prominently, render old_string -> new_string as a diff view with red/green highlighting
    - For `create` tool: show file path and proposed content with syntax highlighting based on file extension
    - For `write` tool: similar to create
    - For `bash` tool (aggressive mode): show command with syntax highlighting, add warning banner for dangerous commands
  - Add tool type indicator in the header (edit/create/bash icon)
  - TDD: Component tests for each tool type rendering

  **Must NOT do**:
  - Do NOT show raw JSON (always render human-friendly view)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple rendering modes with syntax highlighting and diff computation
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T26, T28-T30)
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: T7 (server), T16 (enrichment)

  **References**:
  - Parchmark spec Section 5.3 (Plan data enrichment) — How to display edit and create tools
  - `/home/developer/.claude/plugins/marketplaces/plannotator/packages/ui/components/Viewer.tsx` — Existing rendering patterns

  **Acceptance Criteria**:
  - [ ] TDD: Tests for edit diff, create preview, bash command rendering
  - [ ] Edit tool shows file path + old->new diff
  - [ ] Create tool shows file path + content with syntax highlighting
  - [ ] Bash tool shows command with warning banner

  **QA Scenarios**:
  ```
  Scenario: Edit tool shows diff view
    Tool: Playwright
    Steps:
      1. Start server with edit tool mock data
      2. Navigate to review UI
      3. Assert diff view visible with red (removed) and green (added) lines
      4. Assert file path displayed prominently
    Expected Result: Edit tool renders as visual diff
    Evidence: .sisyphus/evidence/task-27-edit-diff.png
  ```

  **Commit**: YES (group with Wave 6)
  - Message: `feat: advanced features (mode, session, mcp)`
  - Files: `ui/src/components/ToolView.tsx`

- [ ] 28. Session State: Persistent Server + Approval Tracking

  **What to do**:
  - Solve the browser tab spam problem identified by Metis review:
    - Instead of starting a new server per hook invocation, reuse a running server
    - First hook call: start server, open browser
    - Subsequent hook calls: POST new plan data to running server, browser updates via SSE or polling
    - Server shuts down after 5 minutes of inactivity
  - Implement session tracking:
    - PID file at `~/.plancop/server.pid` with port number
    - `scripts/plan-review.sh` checks for running server before launching new one
    - Track approved file paths within session (optional: auto-approve subsequent edits to same file)
  - Implement browser tab reuse:
    - Server pushes new plan data to UI via Server-Sent Events (SSE) on `/api/events`
    - UI subscribes to SSE and re-renders when new plan arrives
  - TDD: Tests for session state management, PID file handling, SSE communication

  **Must NOT do**:
  - Do NOT auto-approve without user opt-in (session tracking is informational by default)
  - Do NOT leave orphan servers running (implement proper cleanup)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex architecture change from ephemeral to persistent server. SSE, PID management, cleanup logic.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T26, T27, T29, T30)
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: T7 (server core), T14 (approve/deny), T17 (storage)

  **References**:
  - Parchmark spec Section 9 (Phase 6) — Session state description
  - Node.js SSE pattern: `res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'})`

  **Acceptance Criteria**:
  - [ ] TDD: Tests for PID file create/read/cleanup, SSE connection
  - [ ] Second hook invocation reuses running server (no new browser tab)
  - [ ] PID file created at `~/.plancop/server.pid`
  - [ ] Server auto-shuts down after 5 minutes inactivity
  - [ ] UI updates when new plan data arrives via SSE

  **QA Scenarios**:
  ```
  Scenario: Server reuse across hook invocations
    Tool: interactive_bash (tmux)
    Steps:
      1. Run simulate.sh with edit tool (starts server, opens browser)
      2. Note the port number
      3. Approve the first review
      4. Run simulate.sh again with create tool
      5. Assert same port is reused (not a new server)
      6. Assert browser tab updates with new plan data
    Expected Result: Single server, single tab, multiple reviews
    Evidence: .sisyphus/evidence/task-28-session-state.txt
  ```

  **Commit**: YES (group with Wave 6)
  - Message: `feat: advanced features (mode, session, mcp)`
  - Files: `scripts/plan-review.sh`, `server/index.ts`, `server/session.ts`

- [ ] 29. Configurable Intercept List

  **What to do**:
  - Create `.plancop/config.json` support:
    ```json
    {
      "intercept": ["edit", "create", "write"],
      "ignore": ["read", "ls", "view"],
      "autoApprove": [],
      "theme": "dark"
    }
    ```
  - Script checks for `.plancop/config.json` in cwd or home directory
  - Intercept list overrides the default list
  - `autoApprove` tools are silently allowed without review
  - Config merging: project config overrides global config
  - TDD: Tests for config loading, merging, tool matching

  **Must NOT do**:
  - Do NOT require config file (defaults work without it)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T26-T28, T30)
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: T11 (hook script), T26 (mode logic)

  **References**:
  - Parchmark spec Section 9 (Phase 6) — Config description

  **Acceptance Criteria**:
  - [ ] TDD: Tests for config loading and tool matching
  - [ ] `.plancop/config.json` with custom intercept list works
  - [ ] Missing config file uses sensible defaults
  - [ ] Project config overrides global config

  **QA Scenarios**:
  ```
  Scenario: Custom intercept list
    Tool: interactive_bash (tmux)
    Steps:
      1. Create `.plancop/config.json` with intercept: ["bash"]
      2. Run simulate.sh with edit tool
      3. Assert edit passes through (not in intercept list)
      4. Run simulate.sh with bash tool
      5. Assert bash is intercepted
    Expected Result: Custom config overrides default intercept list
    Evidence: .sisyphus/evidence/task-29-config.txt
  ```

  **Commit**: YES (group with Wave 6)
  - Message: `feat: advanced features (mode, session, mcp)`
  - Files: `scripts/plan-review.sh`, `.plancop/config.json` (example)

- [ ] 30. MCP Server Mode: submit_plan Tool

  **What to do**:
  - Create `mcp/server.js` — an MCP server that exposes a `submit_plan` tool:
    - Tool name: `submit_plan`
    - Input: `{plan: string}` (plan markdown text)
    - Behavior: starts review UI (same as hook flow), waits for decision
    - Output: `{approved: boolean, feedback?: string}` (annotations if denied)
  - Register in `.mcp.json` for Copilot CLI:
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
  - Update `plugin.json` to include `mcpServers` reference
  - Implement MCP protocol: stdio transport, JSON-RPC 2.0, tools/list + tools/call
  - TDD: Tests for MCP message handling and tool invocation

  **Must NOT do**:
  - Do NOT use the MCP SDK (keep zero-dep — implement minimal JSON-RPC over stdio)
  - Do NOT replace the hook-based flow (MCP is an additional option)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: MCP protocol implementation requires understanding JSON-RPC 2.0 and stdio transport
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T26-T29)
  - **Parallel Group**: Wave 6
  - **Blocks**: None
  - **Blocked By**: T7 (server core for reuse)

  **References**:
  - MCP specification: `https://spec.modelcontextprotocol.io/`
  - `/home/developer/.claude/plugins/marketplaces/plannotator/apps/opencode-plugin/index.ts` — Plannotator's OpenCode MCP plugin (different SDK, but shows the pattern)

  **Acceptance Criteria**:
  - [ ] TDD: Tests for MCP initialize, tools/list, tools/call handlers
  - [ ] `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node mcp/server.js` returns tool list
  - [ ] submit_plan tool triggers browser review UI
  - [ ] Approved returns `{approved: true}`
  - [ ] Denied returns `{approved: false, feedback: '...'}`

  **QA Scenarios**:
  ```
  Scenario: MCP tools/list returns submit_plan
    Tool: Bash
    Steps:
      1. Run `echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":0}' | node mcp/server.js`
      2. Run `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node mcp/server.js`
      3. Assert response contains tool named 'submit_plan'
    Expected Result: MCP server advertises submit_plan tool
    Evidence: .sisyphus/evidence/task-30-mcp-list.txt
  ```

  **Commit**: YES (group with Wave 6)
  - Message: `feat: advanced features (mode, session, mcp)`
  - Files: `mcp/server.js`, `.mcp.json`, `plugin.json`

---

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection -> fix -> re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns (Bun.serve, Bun.file, console.log in server/, as any) — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + linter + `vitest run`. Review all files for: `as any`/`@ts-ignore`, empty catches, console.log in production, commented-out code, unused imports, Bun API remnants. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Run `bash test/simulate.sh edit` — verify browser opens, plan renders, annotations work, approve outputs correct JSON, deny outputs structured feedback. Test version history (deny, simulate revision, verify diff). Test share URL generation. Test keyboard shortcuts. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes. Verify no Bun, OpenCode, Pi, or Claude Code specific code remains.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After | Message | Pre-commit |
|-------|---------|------------|
| Wave 1 | `chore: bootstrap plancop from plannotator fork` | `ls plugin.json .github/hooks/plancop.json` |
| Wave 2 | `feat: port server to node.js and set up build pipeline` | `vitest run && npm run build` |
| Wave 3 | `feat: core plan review UI with annotation support` | `vitest run && npm run build` |
| Wave 4 | `feat: plan version history and diff viewer` | `vitest run` |
| Wave 5 | `feat: url sharing, keyboard shortcuts, and polish` | `vitest run && npm run build` |
| Wave 6 | `feat: advanced features (mode, session, mcp)` | `vitest run` |
| Final | `chore: final verification pass` | `vitest run && npm run build` |

---

## Success Criteria

### Verification Commands
```bash
vitest run                    # Expected: all tests pass, 0 failures
npm run build                 # Expected: ui/dist/index.html exists, < 500KB
bash test/simulate.sh edit    # Expected: browser opens, approve/deny works
node -e "require('./server/index.js')"  # Expected: no Bun errors, server starts
rg 'Bun\.' server/ storage/ scripts/    # Expected: 0 matches (no Bun APIs)
rg 'console\.log' server/              # Expected: 0 matches (use stderr)
```

### Final Checklist
- [ ] All "Must Have" features present and functional
- [ ] All "Must NOT Have" patterns absent from codebase
- [ ] All vitest tests pass
- [ ] Single-file HTML build succeeds
- [ ] Hook fires correctly for edit/create, passes through for read/ls
- [ ] Annotations persist and export correctly
- [ ] Version history saves and diffs render
- [ ] Share URLs compress/decompress correctly
- [ ] Dark theme renders properly
- [ ] PLANCOP_MODE env var works (off/auto/always/aggressive)
- [ ] MCP submit_plan tool responds correctly
