# Decisions — Plancop

## [2026-03-01] Architecture Decisions

### Fork + Flatten (confirmed)
- Fork Plannotator from github.com/backnotprop/plannotator (clone fresh even though local copy exists)
- Flatten: no monorepo workspace structure in final package
- Single root package.json

### Zero Server Dependencies (confirmed)
- server/index.js uses ONLY Node.js built-ins: http, fs, path, child_process, crypto
- No Express, Fastify, or any npm runtime packages in server

### Ephemeral Server (Wave 1-5) → Persistent Server (Wave 6)
- Start: ephemeral server per hook invocation (opens new browser tab each time)
- Wave 6 (T28): Add session state with PID file + SSE to reuse server/tab

### Filter Mechanism (confirmed)
- No matcher in hooks.json (Copilot CLI doesn't support it)
- Filter by toolName in plan-review.sh script
- Default intercept list: edit, create, write
- Passthrough: read, ls, view (and all other tools by default)

### Test Framework (confirmed)
- vitest (natural fit for Vite)
- happy-dom for React component tests
- TDD: write failing test FIRST, then implement

### Diff Library
- @pierre/diffs (matches Plannotator actual dep)
- NOT diff.diffLines (spec was incorrect)

### Feedback Format (confirmed)
- Plain text, LLM-readable
- NOT HTML, NOT JSON
- Format: see plan spec section 5.6
