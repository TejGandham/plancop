#!/usr/bin/env node

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { platform } from "node:os";

const PROTOCOL_VERSION = "2024-11-05";

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (line.trim()) {
      handleMessage(line.trim());
    }
  }
});

process.stdin.on("end", () => {
  if (buffer.trim()) {
    handleMessage(buffer.trim());
  }
});

function sendResponse(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function sendError(id, code, message) {
  sendResponse({
    jsonrpc: "2.0",
    error: { code, message },
    id,
  });
}

function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    sendError(null, -32700, "Parse error");
    return;
  }

  if (!msg || typeof msg !== "object") {
    sendError(null, -32600, "Invalid Request");
    return;
  }

  switch (msg.method) {
    case "initialize":
      handleInitialize(msg);
      return;
    case "initialized":
    case "notifications/initialized":
      return;
    case "tools/list":
      handleToolsList(msg);
      return;
    case "tools/call":
      handleToolsCall(msg);
      return;
    default:
      sendError(msg.id ?? null, -32601, `Method not found: ${msg.method}`);
  }
}

function handleInitialize(msg) {
  sendResponse({
    jsonrpc: "2.0",
    result: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "plancop", version: "1.0.0" },
    },
    id: msg.id ?? null,
  });
}

function handleToolsList(msg) {
  sendResponse({
    jsonrpc: "2.0",
    result: {
      tools: [
        {
          name: "submit_plan",
          description:
            "Submit a plan for human review. Opens browser UI for annotation and approval.",
          inputSchema: {
            type: "object",
            properties: {
              plan: {
                type: "string",
                description: "The plan markdown text to review",
              },
            },
            required: ["plan"],
          },
        },
      ],
    },
    id: msg.id ?? null,
  });
}

async function handleToolsCall(msg) {
  const params = msg.params ?? {};
  const name = params.name;
  const args = params.arguments;

  if (name !== "submit_plan") {
    sendError(msg.id ?? null, -32602, `Unknown tool: ${String(name)}`);
    return;
  }

  const plan = args && typeof args.plan === "string" ? args.plan : "";

  try {
    const result = await launchReview(plan);
    sendResponse({
      jsonrpc: "2.0",
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      },
      id: msg.id ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "Review failed";
    sendError(msg.id ?? null, -32000, message);
  }
}

function launchReview(plan) {
  return new Promise((resolveReview) => {
    let settled = false;

    const htmlPath = resolve(import.meta.dirname, "../ui/dist/index.html");
    let html = "<!doctype html><html><body><h1>plancop ui not built</h1></body></html>";
    if (existsSync(htmlPath)) {
      try {
        html = readFileSync(htmlPath, "utf8");
      } catch {}
    }

    const planData = {
      plan,
      toolName: "submit_plan",
      toolArgs: {},
      cwd: process.cwd(),
      timestamp: Date.now(),
    };

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const server = createServer((req, res) => {
      if (!req.url || !req.method) {
        res.writeHead(400, { "Content-Type": "application/json", ...headers });
        res.end(JSON.stringify({ error: "Bad request" }));
        return;
      }

      const url = new URL(req.url, "http://127.0.0.1");

      if (req.method === "OPTIONS") {
        res.writeHead(204, headers);
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...headers });
        res.end(html);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/plan") {
        res.writeHead(200, { "Content-Type": "application/json", ...headers });
        res.end(JSON.stringify(planData));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/status") {
        res.writeHead(200, { "Content-Type": "application/json", ...headers });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/approve") {
        if (!settled) {
          settled = true;
          res.writeHead(200, { "Content-Type": "application/json", ...headers });
          res.end(JSON.stringify({ ok: true }));
          setTimeout(() => {
            server.close();
            resolveReview({ approved: true });
          }, 300);
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json", ...headers });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/deny") {
        let body = "";
        req.on("data", (chunk) => {
          body += String(chunk);
        });
        req.on("end", () => {
          if (!settled) {
            settled = true;
            let feedback = "Plan denied by user";
            try {
              const data = JSON.parse(body);
              if (typeof data.reason === "string") {
                feedback = data.reason;
              } else if (typeof data.feedback === "string") {
                feedback = data.feedback;
              }
            } catch {}

            res.writeHead(200, { "Content-Type": "application/json", ...headers });
            res.end(JSON.stringify({ ok: true }));
            setTimeout(() => {
              server.close();
              resolveReview({ approved: false, feedback });
            }, 300);
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json", ...headers });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        return;
      }

      const url = `http://127.0.0.1:${address.port}`;
      process.stderr.write(`plancop-mcp: Review UI at ${url}\n`);

      const openCommand = platform() === "darwin" ? "open" : "xdg-open";
      execFile(openCommand, [url], () => {});
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        resolveReview({ approved: false, feedback: "Review timed out" });
      }
    }, 10 * 60 * 1000);

    server.on("close", () => {
      clearTimeout(timeout);
    });
  });
}
