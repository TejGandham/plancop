# Issues — Plancop

## [2026-03-01] Known Gotchas (pre-implementation)

### CRITICAL: toolArgs Double-Parse
- toolArgs in preToolUse stdin is a JSON STRING (not object)
- Must parse the outer JSON first to get toolArgs string, then parse AGAIN
- Affects: T10 (hook.ts), T4 (plan-review.sh), any code that reads toolArgs

### CRITICAL: Node.js http.createServer vs Bun.serve
- Bun.serve has built-in Request/Response objects with .json(), .formData() etc
- Node.js http.createServer has req/res streams — must manually parse body
- Body reading pattern: let body = ''; req.on('data', c => body += c); req.on('end', ...)
- Budget extra time for T7 (server port)

### Browser Tab Spam (deferred to T28)
- Each preToolUse hook invocation = new server = new browser tab
- Acceptable for Waves 1-5 (MVP behavior)
- T28 adds persistent server + SSE to fix this

### Timeout Fail-Open
- If user takes longer than timeoutSec to review, tool executes anyway (fail-open)
- timeoutSec: 86400 set in .github/hooks/plancop.json to give ample time
- This is expected/documented behavior

### Import Paths After Flatten
- Plannotator has workspace imports like @plannotator/ui, @plannotator/server
- After flatten, these must become relative imports
- T1 does NOT modify source files — import fixes happen in T6-T9 as needed
- Check: rg '@plannotator' ui/src/ — should return 0 (except npm package name)
