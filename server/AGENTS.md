# server/ — HTTP Review Server

Zero-dependency Node.js HTTP server. Uses only `node:` built-ins. Spawned by `scripts/plan-review.sh` hook or by `mcp/server.js` internally.

## Structure

```
server/
├── index.ts              # Main server — routes, SSE, lifecycle (418 LOC, @ts-nocheck)
├── enrichment.ts         # enrichPlanData() — language detection, tool arg enrichment
├── hook.ts               # parsePreToolUseInput(), parseToolArgs(), getDecisionJSON()
├── mode.ts               # shouldIntercept() — ReadonlySet<string> for tool filtering
├── session.ts            # PID file CRUD, inactivity timeout (INACTIVITY_TIMEOUT_MS = 5min)
├── storage-versions.ts   # savePlan(), getVersions(), getVersion() — ~/.plancop/history/
├── config.ts             # loadConfig() — reads .plancop/config.json
├── package.json          # { "type": "module" } — DO NOT DELETE (ESM resolution)
└── __tests__/
    ├── index.test.ts     # Child-process spawn tests (@ts-nocheck)
    ├── enrichment.test.ts
    ├── hook.test.ts
    ├── mode.test.ts
    ├── session.test.ts
    ├── config.test.ts
    └── storage-versions.test.ts
```

## Route Map

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/` | writeHtml() | Serves ui/dist/index.html |
| GET | `/api/status` | writeJson() | `{ ok: true, persistentMode }` |
| GET | `/api/plan` | writeJson() | Returns enriched plan data; saves to history on first call |
| GET | `/api/events` | SSE stream | Persistent mode only — pushes new plans to connected UIs |
| GET | `/api/versions` | writeJson() | Plan version history list |
| GET | `/api/version/:id` | writeJson() | Single version content |
| POST | `/api/push-plan` | readBody() | Persistent mode: accept new plan. 400 if ephemeral, 409 if plan pending |
| POST | `/api/approve` | settleReview() | Resolves decision Promise with `permissionDecision: "allow"` |
| POST | `/api/deny` | readBody() → settleReview() | Resolves with `permissionDecision: "deny"` + reason |
| OPTIONS | `*` | 204 | CORS preflight |
| * | `*` | 404 | `{ error: "Not found" }` |

## Key Functions

| Function | Purpose |
|----------|---------|
| `main()` | Entry point. Loads hook input, creates server, waits for decision |
| `createReviewState(hookInput)` | Creates state bag with enriched plan data + decision Promise |
| `settleReview(state, decision)` | One-shot resolve. `settled` flag prevents double-call |
| `parseHookInput(input)` | Validates PLAN_INPUT JSON shape |
| `loadInitialHookInput(required)` | Reads `process.env.PLAN_INPUT`, crashes if missing+required |
| `readBody(req)` | Promise wrapper for request body |
| `writeJson(res, status, body)` | JSON response with CORS headers |
| `broadcastPlan(data)` | Push to all SSE clients (persistent mode) |
| `shutdown(exitCode)` | Graceful shutdown with 500ms force-exit timeout |

## Where to Look

| Task | File | Lines |
|------|------|-------|
| Add new API route | index.ts | Inside createServer callback (~L207) |
| Change CORS policy | index.ts | CORS_HEADERS constant (~L35) |
| Add tool enrichment | enrichment.ts | enrichPlanData() |
| Change interception list | mode.ts | AUTO_TOOLS, AGGRESSIVE_TOOLS sets |
| Modify plan storage | storage-versions.ts | savePlan(), PLANCOP_DIR |
| Change session timeout | session.ts | INACTIVITY_TIMEOUT_MS |
| Add config option | config.ts | DEFAULT_CONFIG, loadConfig() |

## Conventions (server-specific)

- **Zero npm deps** — Only `node:http`, `node:fs`, `node:path`, `node:os`, `node:crypto`. Adding deps is forbidden.
- **writeJson/writeHtml** — All responses go through these helpers. Never write to `res` directly.
- **readBody()** — Always use for POST body parsing. Returns Promise\<string\>.
- **ReadonlySet** — Tool lists are `ReadonlySet<string>` for immutability.
- **Error returns** — `parseToolArgs()` returns `ToolArgsParseError` object, never throws.

## Test Pattern

Tests spawn the actual server as a child process:

```
startServer(planInput?, extraEnv?) → { process, port, homeDir, waitForExit() }
```

- Spawns `npx tsx server/index.ts` with PLAN_INPUT env var
- Parses `PLANCOP_PORT:(\d+)` from stderr to get assigned port
- Creates temp HOME dir for session isolation
- afterEach kills all spawned processes + cleans temp dirs
- Each test does HTTP requests to `http://127.0.0.1:${port}/api/...`

## Gotchas

- **@ts-nocheck** — index.ts and index.test.ts have type checking disabled. Don't remove.
- **Dual exit** — shutdown() calls process.exit() twice (callback + 500ms timeout).
- **settled gate** — Once settled=true, approve/deny calls are silently ignored.
- **Port 0** — Always auto-assigned. Never hardcode a port.
- **PLAN_INPUT** — Must be valid JSON with `{ timestamp, cwd, toolName, toolArgs }`. toolArgs is itself a JSON string (double-parse).
- **Persistent 409** — Second push-plan while first is pending returns 409 Conflict.
