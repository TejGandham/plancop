/**
 * Plancop — ExitPlanMode hook server
 *
 * Reads hook event from stdin (PermissionRequest / ExitPlanMode),
 * starts a Bun HTTP server with the review UI, waits for user
 * decision (approve/deny), outputs the result to stdout.
 *
 * Input (stdin):  { tool_input: { plan: "..." }, permission_mode?: "..." }
 * Output (stdout): { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior, message? } } }
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- Types ---

interface HookEvent {
  tool_input: { plan: string };
  permission_mode?: string;
}

// --- Read stdin ---

const eventJson = await Bun.stdin.text();

let plan = "";
let permissionMode = "default";

try {
  const event: unknown = JSON.parse(eventJson);
  if (event && typeof event === "object") {
    const e = event as Record<string, unknown>;
    const toolInput = e.tool_input;
    if (toolInput && typeof toolInput === "object") {
      const ti = toolInput as Record<string, unknown>;
      if (typeof ti.plan === "string") {
        plan = ti.plan;
      }
    }
    if (typeof e.permission_mode === "string") {
      permissionMode = e.permission_mode;
    }
  }
} catch {
  console.error("plancop: failed to parse hook event from stdin");
  process.exit(1);
}

if (!plan) {
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
        origin: "claude-code",
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

// --- Output PermissionRequest decision ---

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

process.exit(0);
