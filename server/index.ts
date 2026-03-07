/**
 * Plancop — plan review hook server
 *
 * Supports two agent CLIs:
 * - Claude Code: ExitPlanMode PermissionRequest hook
 *   Input (stdin):  { tool_input: { plan: "..." }, permission_mode?: "..." }
 *   Output (stdout): { hookSpecificOutput: { hookEventName: "PermissionRequest", decision } }
 * - Copilot CLI: preToolUse hook intercepting exit_plan_mode
 *   Input (stdin):  { toolName: "exit_plan_mode", toolArgs: "...", cwd: "...", timestamp: ... }
 *   Output (stdout): { permissionDecision: "allow"|"deny", permissionDecisionReason?: "..." }
 *
 * Reads hook event from stdin, starts a Bun HTTP server with the review UI,
 * waits for user decision (approve/deny), outputs the result to stdout.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- Types ---

type Source = "claude-code" | "copilot-cli";

// --- Read stdin ---

const eventJson = await Bun.stdin.text();

let source: Source = "claude-code";
let plan = "";
let permissionMode = "default";

try {
  const event: unknown = JSON.parse(eventJson);
  if (event && typeof event === "object") {
    const e = event as Record<string, unknown>;

    if (typeof e.toolName === "string") {
      // --- Copilot CLI preToolUse hook ---
      source = "copilot-cli";

      // Fast path: allow all non-exit_plan_mode tool calls immediately
      if (e.toolName !== "exit_plan_mode") {
        process.exit(0);
      }

      // Read plan from plan file in cwd
      const cwd = typeof e.cwd === "string" ? e.cwd : process.cwd();
      const planPaths = ["plan-01.md", "plan.md"];
      for (const filename of planPaths) {
        const planPath = resolve(cwd, filename);
        if (existsSync(planPath)) {
          try {
            plan = readFileSync(planPath, "utf8");
            break;
          } catch {}
        }
      }

      // Fallback: try to extract plan from toolArgs
      if (!plan && typeof e.toolArgs === "string") {
        try {
          const args = JSON.parse(e.toolArgs) as Record<string, unknown>;
          if (typeof args.plan === "string") plan = args.plan;
          else if (typeof args.content === "string") plan = args.content;
        } catch {}
      }
    } else if (e.tool_input && typeof e.tool_input === "object") {
      // --- Claude Code ExitPlanMode PermissionRequest hook ---
      source = "claude-code";
      const ti = e.tool_input as Record<string, unknown>;
      if (typeof ti.plan === "string") {
        plan = ti.plan;
      }
      if (typeof e.permission_mode === "string") {
        permissionMode = e.permission_mode;
      }
    }
  }
} catch {
  console.error("plancop: failed to parse hook event from stdin");
  process.exit(1);
}

if (!plan) {
  if (source === "copilot-cli") {
    // No plan file found — allow exit_plan_mode to proceed without review
    console.error("plancop: no plan file found in cwd, allowing exit_plan_mode");
    console.log(JSON.stringify({ permissionDecision: "allow" }));
    process.exit(0);
  }
  console.error("plancop: no plan content in hook event");
  process.exit(1);
}

// --- Load UI HTML ---

const htmlPath = resolve(import.meta.dirname, "../ui/dist/index.html");
let rawHtml = "<!doctype html><html><body><h1>plancop ui not built</h1><p>Run: cd ui && bun run build</p></body></html>";
if (existsSync(htmlPath)) {
  try {
    rawHtml = readFileSync(htmlPath, "utf8");
  } catch {}
}

// --- Session token ---

const sessionToken = crypto.randomUUID();
const html = rawHtml.replace('</head>', `<script>window.__PLANCOP_TOKEN__="${sessionToken}";</script></head>`);


// --- Decision promise ---

let resolveDecision: (result: { approved: boolean; feedback?: string }) => void;
const decisionPromise = new Promise<{ approved: boolean; feedback?: string }>((r) => {
  resolveDecision = r;
});

let settled = false;

// --- Start server ---

const server = Bun.serve({
  port: 0,

  async fetch(req) {
    const url = new URL(req.url);

    // Auth: require session token for all /api/* routes
    if (url.pathname.startsWith("/api/")) {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (token !== sessionToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Serve UI
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // API: plan data
    if (req.method === "GET" && url.pathname === "/api/plan") {
      return Response.json({
        plan,
        origin: source,
        permissionMode,
      });
    }


    // API: approve
    if (req.method === "POST" && url.pathname === "/api/approve") {
      if (!settled) {
        settled = true;
        resolveDecision({ approved: true });
      }
      return Response.json({ ok: true });
    }

    // API: deny / feedback
    if (req.method === "POST" && (url.pathname === "/api/deny" || url.pathname === "/api/feedback")) {
      let feedback = "Plan changes requested";
      try {
        const body = (await req.json()) as Record<string, unknown>;
        if (typeof body.reason === "string") {
          feedback = body.reason;
        } else if (typeof body.feedback === "string") {
          feedback = body.feedback;
        }
      } catch {}

      if (!settled) {
        settled = true;
        resolveDecision({ approved: false, feedback });
      }
      return Response.json({ ok: true });
    }

    // OPTIONS (CORS preflight)
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

// --- Open browser ---

const url = `http://localhost:${server.port}`;
console.error(`plancop: Review UI at ${url}`);
console.error(`PLANCOP_TOKEN:${sessionToken}`);

const openCommand = process.platform === "darwin" ? "open" : "xdg-open";
Bun.spawn([openCommand, url], { stdio: ["ignore", "ignore", "ignore"] });

// --- Wait for decision ---

// --- Signal handlers ---

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!settled) {
    settled = true;
    resolveDecision({ approved: false, feedback: "Review server shutting down \u2014 plan denied for safety" });
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const result = await decisionPromise;

// Give browser time to receive response and update UI (skip on signal shutdown)
if (!shuttingDown) {
  await Bun.sleep(1500);
}

server.stop();

// --- Output decision ---

if (source === "copilot-cli") {
  // Copilot CLI permissionDecision format
  if (result.approved) {
    console.log(JSON.stringify({ permissionDecision: "allow" }));
  } else {
    console.log(
      JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: result.feedback || "Plan changes requested",
      })
    );
  }
} else {
  // Claude Code PermissionRequest format
  if (result.approved) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "allow" },
        },
      })
    );
  } else {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: {
            behavior: "deny",
            message: result.feedback || "Plan changes requested",
          },
        },
      })
    );
  }
}

process.exit(0);
