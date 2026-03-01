# server/ — Bun Review Server

Bun-based HTTP server. Uses `Bun.serve()` with zero npm dependencies. Reads ExitPlanMode hook input from stdin, serves review UI, outputs PermissionRequest decision to stdout.

## Structure

```
server/
├── index.ts              # Main server — Bun.serve(), stdin/stdout, ~170 LOC
├── storage-versions.ts   # savePlan(), getVersions(), getVersion() — ~/.plancop/history/
├── package.json          # { "type": "module" } — DO NOT DELETE (ESM resolution)
└── __tests__/
    ├── index.test.ts     # Child-process spawn tests (@ts-nocheck, @vitest-environment node)
    └── storage-versions.test.ts
```

## Route Map

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/` | Serves HTML | ui/dist/index.html (single-file build) |
| GET | `/api/status` | JSON | `{ ok: true }` |
| GET | `/api/plan` | JSON | Returns plan data with origin, permissionMode, sharingEnabled |
| GET | `/api/versions` | JSON | Plan version history list |
| GET | `/api/version/:id` | JSON | Single version content |
| POST | `/api/approve` | JSON | Resolves decision as `allow`, exits |
| POST | `/api/deny` | JSON | Resolves decision as `deny` with reason, exits |
| POST | `/api/feedback` | JSON | Same as deny — sends feedback as deny message |
| OPTIONS | `*` | 204 | CORS preflight |
| * | `*` | 404 | `{ error: "Not found" }` |

## Data Flow

```
Claude Code ──ExitPlanMode──▶ stdin (JSON) ──▶ server/index.ts
                                                    │
                                              Bun.serve({ port: 0 })
                                              Opens browser
                                                    │
                                              Browser UI (React)
                                              GET /api/plan
                                              POST /api/approve | /api/deny | /api/feedback
                                                    │
                                              Decision → stdout (PermissionRequest JSON)
                                              Server exits
```

## Input/Output Format

**stdin** (ExitPlanMode event):
```json
{
  "tool_input": { "plan": "# Plan markdown..." },
  "permission_mode": "default"
}
```

**stdout** (PermissionRequest decision):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" }
  }
}
```

Or with deny + feedback:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "deny", "message": "Fix the auth section" }
  }
}
```

## Where to Look

| Task | File |
|------|------|
| Add new API route | index.ts — inside `Bun.serve({ fetch })` handler |
| Change CORS policy | index.ts — `corsHeaders` object |
| Modify plan storage | storage-versions.ts — `savePlan()`, `PLANCOP_DIR` |

## Conventions

- **Bun runtime** — Uses `Bun.serve()`, `Bun.file()`, `Bun.spawn()`, `Bun.stdin`
- **Zero npm deps** — Server uses only Bun built-ins. No Express, no npm packages.
- **Ephemeral only** — One decision per invocation. Server starts, waits, outputs, exits.
- **Promise-based decision** — `resolve()` from approve/deny settles the decision; `settled` flag prevents double-call.

## Test Pattern

Tests spawn the server as a child process via `bun run server/index.ts`:

```
startServer(planContent?) → { process, port, homeDir, waitForExit() }
```

- Writes ExitPlanMode JSON to stdin, closes stdin
- Parses `http://localhost:(\d+)` from stderr to get assigned port
- Creates temp HOME dir for isolation
- afterEach kills all spawned processes + cleans temp dirs
- Uses `// @vitest-environment node` to avoid happy-dom CORS issues

## Gotchas

- **@ts-nocheck** — index.test.ts has type checking disabled. Don't remove.
- **settled gate** — Once `settled = true`, subsequent approve/deny calls are silently ignored.
- **Port 0** — Always auto-assigned via `Bun.serve({ port: 0 })`. Never hardcode.
- **stdin must close** — Server reads all of stdin before starting. Tests must call `child.stdin.end()`.
- **UI must be built first** — Reads `ui/dist/index.html`. If missing, returns 500.
