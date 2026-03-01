// @ts-nocheck
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enrichPlanData } from "./enrichment.ts";
import { getVersion, getVersions, savePlan } from "./storage-versions.ts";
import {
  INACTIVITY_TIMEOUT_MS,
  writePidFile,
  removePidFile,
  readPidFile,
  isServerRunning,
} from "./session.ts";

type HookInput = {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: string;
};

type Decision =
  | { permissionDecision: "allow" }
  | { permissionDecision: "deny"; permissionDecisionReason: string };

type ReviewState = {
  hookInput: HookInput;
  planData: ReturnType<typeof enrichPlanData>;
  planSaved: boolean;
  settled: boolean;
  resolveDecision: (decision: Decision) => void;
  decisionPromise: Promise<Decision>;
};

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

function parseHookInput(input: unknown): HookInput {
  if (!input || typeof input !== "object") {
    throw new Error("PLAN_INPUT must be an object");
  }

  const value = input as Record<string, unknown>;
  if (
    typeof value.timestamp !== "number" ||
    typeof value.cwd !== "string" ||
    typeof value.toolName !== "string" ||
    typeof value.toolArgs !== "string"
  ) {
    throw new Error("PLAN_INPUT is missing required fields");
  }

  return {
    timestamp: value.timestamp,
    cwd: value.cwd,
    toolName: value.toolName,
    toolArgs: value.toolArgs,
  };
}

function loadInitialHookInput(required: boolean): HookInput | null {
  const rawInput = process.env.PLAN_INPUT;
  if (!rawInput) {
    if (required) {
      throw new Error("PLAN_INPUT is missing");
    }
    return null;
  }

  try {
    const parsedInput = JSON.parse(rawInput) as unknown;
    return parseHookInput(parsedInput);
  } catch (error) {
    if (error instanceof Error && error.message.includes("PLAN_INPUT")) {
      throw error;
    }
    throw new Error("PLAN_INPUT is invalid JSON");
  }
}

function loadHtml(): string {
  const htmlPath = resolve(import.meta.dirname, "../ui/dist/index.html");
  try {
    return readFileSync(htmlPath, "utf8");
  } catch {
    return "<!doctype html><html><body><h1>plancop ui not built</h1></body></html>";
  }
}

function createReviewState(hookInput: HookInput): ReviewState {
  const planData = enrichPlanData(hookInput);
  let resolveDecision: (decision: Decision) => void = () => {};
  const decisionPromise = new Promise<Decision>((resolveDecisionPromise) => {
    resolveDecision = resolveDecisionPromise;
  });

  return {
    hookInput,
    planData,
    planSaved: false,
    settled: false,
    resolveDecision,
    decisionPromise,
  };
}

function settleReview(reviewState: ReviewState | null, decision: Decision): void {
  if (!reviewState || reviewState.settled) {
    return;
  }
  reviewState.settled = true;
  reviewState.resolveDecision(decision);
}

function writeSse(client: ServerResponse, data: unknown): void {
  client.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function main(): Promise<void> {
  const sessionMode = process.env.PLANCOP_SESSION_MODE ?? "ephemeral";
  const persistentMode = sessionMode !== "ephemeral";
  const initialHookInput = loadInitialHookInput(!persistentMode);
  const html = loadHtml();
  const sseClients: ServerResponse[] = [];
  let reviewState: ReviewState | null = initialHookInput ? createReviewState(initialHookInput) : null;
  let waitingPushResponse = false;
  let inactivityTimer: NodeJS.Timeout | null = null;
  let shuttingDown = false;

  const resetInactivityTimer = (): void => {
    if (!persistentMode || shuttingDown) {
      return;
    }

    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    inactivityTimer = setTimeout(() => {
      shutdown(0);
    }, INACTIVITY_TIMEOUT_MS);
  };

  const broadcastPlan = (data: ReturnType<typeof enrichPlanData>): void => {
    for (const client of [...sseClients]) {
      try {
        writeSse(client, data);
      } catch {
        const index = sseClients.indexOf(client);
        if (index >= 0) {
          sseClients.splice(index, 1);
        }
      }
    }
  };

  const server = createServer(async (req, res) => {
    resetInactivityTimer();

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
      writeJson(res, 200, { ok: true, persistentMode });
      return;
    }

    if (req.method === "GET" && pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS_HEADERS,
      });
      res.write("\n");
      sseClients.push(res);

      if (reviewState?.planData) {
        writeSse(res, reviewState.planData);
      }

      req.on("close", () => {
        const index = sseClients.indexOf(res);
        if (index >= 0) {
          sseClients.splice(index, 1);
        }
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/plan") {
      if (!reviewState) {
        writeJson(res, 404, { error: "No active plan" });
        return;
      }

      if (!reviewState.planSaved) {
        savePlan(reviewState.hookInput.cwd, reviewState.planData.plan);
        reviewState.planSaved = true;
      }
      writeJson(res, 200, reviewState.planData);
      return;
    }

    if (req.method === "GET" && pathname === "/api/versions") {
      if (!reviewState) {
        writeJson(res, 200, { versions: [] });
        return;
      }
      const versions = getVersions(reviewState.hookInput.cwd, reviewState.planData.plan);
      writeJson(res, 200, { versions });
      return;
    }

    if (req.method === "GET" && /^\/api\/version\/[^/]+$/.test(pathname)) {
      const versionId = Number(pathname.split("/").pop());
      const version =
        reviewState && Number.isInteger(versionId)
          ? getVersion(reviewState.hookInput.cwd, reviewState.planData.plan, versionId)
          : null;
      writeJson(res, 200, { version });
      return;
    }

    if (req.method === "POST" && pathname === "/api/push-plan") {
      if (!persistentMode) {
        writeJson(res, 400, { error: "push-plan is only available in persistent mode" });
        return;
      }

      if (waitingPushResponse) {
        writeJson(res, 409, { error: "A plan is already awaiting decision" });
        return;
      }

      const body = await readBody(req);
      const payload = safeParseJson(body);

      let hookInput: HookInput;
      try {
        hookInput = parseHookInput(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid push-plan payload";
        writeJson(res, 400, { error: message });
        return;
      }

      reviewState = createReviewState(hookInput);
      broadcastPlan(reviewState.planData);

      waitingPushResponse = true;
      const decision = await reviewState.decisionPromise;
      waitingPushResponse = false;
      writeJson(res, 200, decision);
      return;
    }

    if (req.method === "POST" && pathname === "/api/approve") {
      settleReview(reviewState, { permissionDecision: "allow" });
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

      settleReview(reviewState, {
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      });

      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 404, { error: "Not found" });
  });

  const shutdown = (exitCode: number): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }

    for (const client of [...sseClients]) {
      try {
        client.end();
      } catch {
      }
    }
    sseClients.length = 0;

    if (persistentMode) {
      removePidFile();
    }

    server.close(() => {
      process.exit(exitCode);
    });

    setTimeout(() => {
      process.exit(exitCode);
    }, 500);
  };

  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));

  server.listen(0, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      process.stderr.write("PLANCOP_PORT:0\n");
      return;
    }

    process.stderr.write(`PLANCOP_PORT:${address.port}\n`);

    if (persistentMode) {
      const existing = readPidFile();
      if (existing && existing.pid !== process.pid && isServerRunning(existing)) {
        process.stderr.write("plancop server warning: another session server appears active\n");
      }
      writePidFile({ pid: process.pid, port: address.port, startedAt: Date.now() });
      resetInactivityTimer();
    }
  });

  if (!persistentMode) {
    const decision = await reviewState!.decisionPromise;
    process.stdout.write(`${JSON.stringify(decision)}\n`);
    setTimeout(() => shutdown(0), 100);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`plancop server error: ${message}\n`);
  removePidFile();
  process.exit(1);
});
