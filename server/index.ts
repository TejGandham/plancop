// @ts-nocheck
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type HookInput = {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: string;
};

type Decision =
  | { permissionDecision: "allow" }
  | { permissionDecision: "deny"; permissionDecisionReason: string };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function writeHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(html);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk: unknown) => {
      body += String(chunk);
    });
    req.on("end", () => {
      resolveBody(body);
    });
    req.on("error", (error: unknown) => {
      rejectBody(error);
    });
  });
}

function safeParseJson(value: string): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function loadHookInput(): HookInput {
  const rawInput = process.env.PLAN_INPUT;
  if (!rawInput) {
    throw new Error("PLAN_INPUT is missing");
  }

  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(rawInput);
  } catch {
    throw new Error("PLAN_INPUT is invalid JSON");
  }

  if (!parsedInput || typeof parsedInput !== "object") {
    throw new Error("PLAN_INPUT must be an object");
  }

  const input = parsedInput as Record<string, unknown>;
  if (
    typeof input.timestamp !== "number" ||
    typeof input.cwd !== "string" ||
    typeof input.toolName !== "string" ||
    typeof input.toolArgs !== "string"
  ) {
    throw new Error("PLAN_INPUT is missing required fields");
  }

  return {
    timestamp: input.timestamp,
    cwd: input.cwd,
    toolName: input.toolName,
    toolArgs: input.toolArgs,
  };
}

function loadHtml(): string {
  const htmlPath = resolve(process.cwd(), "ui/dist/index.html");
  try {
    return readFileSync(htmlPath, "utf8");
  } catch {
    return "<!doctype html><html><body><h1>plancop ui not built</h1></body></html>";
  }
}

function getPlanContent(toolName: string, toolArgs: Record<string, unknown>): string {
  if (toolName === "edit" && typeof toolArgs.new_string === "string") {
    return toolArgs.new_string;
  }

  if (toolName === "create" && typeof toolArgs.content === "string") {
    return toolArgs.content;
  }

  if (typeof toolArgs.plan === "string") {
    return toolArgs.plan;
  }

  return "";
}

async function main(): Promise<void> {
  const hookInput = loadHookInput();
  const parsedToolArgs = safeParseJson(hookInput.toolArgs);
  const html = loadHtml();

  let settled = false;
  let resolveDecision: (decision: Decision) => void = () => {};
  const decisionPromise = new Promise<Decision>((resolveDecisionPromise) => {
    resolveDecision = resolveDecisionPromise;
  });

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      writeJson(res, 400, { error: "Bad request" });
      return;
    }

    const parsedUrl = new URL(req.url, "http://127.0.0.1");
    const pathname = parsedUrl.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/") {
      writeHtml(res, 200, html);
      return;
    }

    if (req.method === "GET" && pathname === "/api/status") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/plan") {
      writeJson(res, 200, {
        plan: getPlanContent(hookInput.toolName, parsedToolArgs),
        toolName: hookInput.toolName,
        toolArgs: parsedToolArgs,
        cwd: hookInput.cwd,
        timestamp: hookInput.timestamp,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/versions") {
      writeJson(res, 200, { versions: [] });
      return;
    }

    if (req.method === "GET" && /^\/api\/version\/[^/]+$/.test(pathname)) {
      writeJson(res, 200, { version: null });
      return;
    }

    if (req.method === "POST" && pathname === "/api/approve") {
      if (!settled) {
        settled = true;
        resolveDecision({ permissionDecision: "allow" });
      }
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/deny") {
      const body = await readBody(req);
      const data = safeParseJson(body);
      const reason =
        typeof data.reason === "string"
          ? data.reason
          : typeof data.feedback === "string"
            ? data.feedback
            : "Plan denied by user";

      if (!settled) {
        settled = true;
        resolveDecision({
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        });
      }

      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 404, { error: "Not found" });
  });

  server.listen(0, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      process.stderr.write("PLANCOP_PORT:0\n");
      return;
    }
    process.stderr.write(`PLANCOP_PORT:${address.port}\n`);
  });

  const decision = await decisionPromise;
  process.stdout.write(`${JSON.stringify(decision)}\n`);

  setTimeout(() => {
    server.close(() => {
      process.exit(0);
    });
  }, 500);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`plancop server error: ${message}\n`);
  process.exit(1);
});
