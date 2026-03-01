#!/usr/bin/env node
/**
 * Plancop CLI Server — Node.js entry point for preToolUse hook
 *
 * Reads PLAN_INPUT env var, starts an HTTP server, serves review UI,
 * waits for approve/deny, outputs decision JSON to stdout, then exits.
 *
 * Stderr protocol:
 *   PLANCOP_PORT:XXXX  — signals the port to the parent bash script
 *
 * Stdout:
 *   {"permissionDecision":"allow"} or {"permissionDecision":"deny","permissionDecisionReason":"..."}
 *
 * Env vars:
 *   PLAN_INPUT       — preToolUse JSON from Copilot CLI (required)
 *   PLANCOP_PORT     — pin to a specific port (default: 0 = random)
 *   PLANNOTATOR_PORT — alias for PLANCOP_PORT (checked as fallback)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";

// --- Read input ---
const planInput = process.env.PLAN_INPUT;
if (!planInput) {
  process.stderr.write("plancop-server: ERROR: PLAN_INPUT env var is required\n");
  process.exit(1);
}

let parsedInput: { toolName?: string; toolArgs?: string; cwd?: string };
try {
  parsedInput = JSON.parse(planInput);
} catch {
  process.stderr.write("plancop-server: ERROR: PLAN_INPUT is not valid JSON\n");
  process.exit(1);
}

// Extract tool info for display
const toolName = parsedInput.toolName || "unknown";
let toolArgs: Record<string, unknown> = {};
try {
  toolArgs = JSON.parse(parsedInput.toolArgs || "{}");
} catch {
  // toolArgs might not be JSON-stringified in all cases
  toolArgs = { raw: parsedInput.toolArgs };
}

// --- Determine port ---
const envPort = process.env.PLANCOP_PORT || process.env.PLANNOTATOR_PORT;
const port = envPort ? parseInt(envPort, 10) : 0;

// --- Build minimal review HTML ---
function buildHtml(): string {
  const fileInfo = toolArgs.file || toolArgs.path || toolArgs.file_path || "";
  const oldStr = (toolArgs.old_string as string) || "";
  const newStr = (toolArgs.new_string as string) || (toolArgs.file_text as string) || (toolArgs.content as string) || "";
  const command = (toolArgs.command as string) || "";

  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let changeSection = "";
  if (toolName === "bash" && command) {
    changeSection = `
      <h3>Command</h3>
      <pre class="code">${escHtml(command)}</pre>`;
  } else if (oldStr && newStr) {
    changeSection = `
      <h3>Old</h3>
      <pre class="code old">${escHtml(oldStr)}</pre>
      <h3>New</h3>
      <pre class="code new">${escHtml(newStr)}</pre>`;
  } else if (newStr) {
    changeSection = `
      <h3>Content</h3>
      <pre class="code new">${escHtml(newStr)}</pre>`;
  } else {
    changeSection = `
      <h3>Tool Args</h3>
      <pre class="code">${escHtml(JSON.stringify(toolArgs, null, 2))}</pre>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Plancop Review: ${escHtml(toolName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           max-width: 800px; margin: 40px auto; padding: 0 20px; background: #1a1a2e; color: #e0e0e0; }
    h1 { color: #00d4ff; margin-bottom: 8px; }
    h2 { color: #a0a0c0; font-weight: normal; margin-bottom: 24px; }
    h3 { color: #b0b0d0; margin: 16px 0 8px; }
    .code { background: #16213e; padding: 16px; border-radius: 8px; overflow-x: auto;
            font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px;
            line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
    .old { border-left: 3px solid #ff4757; }
    .new { border-left: 3px solid #2ed573; }
    .actions { margin-top: 32px; display: flex; gap: 16px; }
    button { padding: 12px 32px; border: none; border-radius: 8px; font-size: 16px;
             cursor: pointer; font-weight: 600; transition: opacity 0.2s; }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .approve { background: #2ed573; color: #1a1a2e; }
    .deny { background: #ff4757; color: white; }
    .feedback { margin-top: 16px; }
    textarea { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333;
               background: #16213e; color: #e0e0e0; font-size: 14px; resize: vertical;
               font-family: inherit; min-height: 60px; }
    .status { margin-top: 16px; padding: 12px; border-radius: 8px; display: none; }
    .status.show { display: block; }
    .status.ok { background: #2ed57322; border: 1px solid #2ed573; }
    .status.err { background: #ff475722; border: 1px solid #ff4757; }
  </style>
</head>
<body>
  <h1>Plancop Review</h1>
  <h2>Tool: <strong>${escHtml(toolName)}</strong>${fileInfo ? ` — ${escHtml(String(fileInfo))}` : ""}</h2>
  ${changeSection}
  <div class="feedback">
    <textarea id="feedback" placeholder="Optional feedback / reason for denial..."></textarea>
  </div>
  <div class="actions">
    <button class="approve" onclick="decide('approve')">✓ Approve</button>
    <button class="deny" onclick="decide('deny')">✗ Deny</button>
  </div>
  <div id="status" class="status"></div>
  <script>
    async function decide(action) {
      const btns = document.querySelectorAll('button');
      btns.forEach(b => b.disabled = true);
      const feedback = document.getElementById('feedback').value;
      const statusEl = document.getElementById('status');
      try {
        const res = await fetch('/api/' + action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback })
        });
        if (res.ok) {
          statusEl.className = 'status show ok';
          statusEl.textContent = action === 'approve'
            ? 'Approved — you can close this tab.'
            : 'Denied — you can close this tab.';
        } else {
          throw new Error('Server returned ' + res.status);
        }
      } catch (e) {
        statusEl.className = 'status show err';
        statusEl.textContent = 'Error: ' + e.message;
        btns.forEach(b => b.disabled = false);
      }
    }
  </script>
</body>
</html>`;
}

// --- Create HTTP server ---
const html = buildHtml();
let decided = false;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || "/", `http://127.0.0.1`);

  // API: Approve
  if (url.pathname === "/api/approve" && req.method === "POST") {
    readBody(req).then((body) => {
      const data = safeJsonParse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      finishWithDecision("allow", data?.feedback);
    });
    return;
  }

  // API: Deny
  if (url.pathname === "/api/deny" && req.method === "POST") {
    readBody(req).then((body) => {
      const data = safeJsonParse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      finishWithDecision("deny", data?.feedback || "Denied by user");
    });
    return;
  }

  // API: Plan data (for future UI upgrades)
  if (url.pathname === "/api/plan" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ toolName, toolArgs, input: parsedInput }));
    return;
  }

  // Serve HTML for everything else
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
});

server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;

  // Signal port to parent bash script via stderr
  process.stderr.write(`PLANCOP_PORT:${actualPort}\n`);
  process.stderr.write(`plancop-server: listening on http://127.0.0.1:${actualPort}\n`);
});

server.on("error", (err) => {
  process.stderr.write(`plancop-server: ERROR: ${err.message}\n`);
  process.exit(1);
});

// --- Helpers ---

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", () => resolve(""));
  });
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function finishWithDecision(decision: "allow" | "deny", reason?: string): void {
  if (decided) return;
  decided = true;

  // Build Copilot CLI decision JSON
  const output: Record<string, string> =
    decision === "allow"
      ? { permissionDecision: "allow" }
      : { permissionDecision: "deny", permissionDecisionReason: reason || "Denied by user" };

  // Output decision JSON to stdout (only thing on stdout!)
  process.stdout.write(JSON.stringify(output) + "\n");

  // Give the HTTP response time to flush, then shut down
  setTimeout(() => {
    server.close(() => {
      process.exit(0);
    });
    // Force exit if close hangs
    setTimeout(() => process.exit(0), 500);
  }, 100);
}
