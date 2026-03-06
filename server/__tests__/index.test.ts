// @ts-nocheck
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type RunningServer = {
  process: ChildProcessWithoutNullStreams;
  port: number;
  token: string;
  homeDir: string;
  getStdout: () => string;
  getStderr: () => string;
  waitForExit: () => Promise<number | null>;
};

const running: RunningServer[] = [];

function startServer(planInput?: string, extraEnv: Record<string, string> = {}): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const homeDir = mkdtempSync(join(tmpdir(), "plancop-index-test-home-"));
    const child = spawn("./node_modules/.bin/tsx", ["server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        ...extraEnv,
        PLAN_INPUT:
          planInput ??
          JSON.stringify({
            timestamp: Date.now(),
            cwd: process.cwd(),
            toolName: "edit",
            toolArgs: JSON.stringify({
              file: "README.md",
              old_string: "old",
              new_string: "new",
            }),
          }),
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk: unknown) => {
      stdout += String(chunk);
    });

    let portFound = "";
    let tokenFound = "";

    child.stderr.on("data", (chunk: unknown) => {
      stderr += String(chunk);
      if (!portFound) {
        const portMatch = stderr.match(/PLANCOP_PORT:(\d+)/);
        if (portMatch) portFound = portMatch[1];
      }
      if (!tokenFound) {
        const tokenMatch = stderr.match(/PLANCOP_TOKEN:([^\s]+)/);
        if (tokenMatch) tokenFound = tokenMatch[1];
      }
      if (portFound && tokenFound && !settled) {
        settled = true;
        const server: RunningServer = {
          process: child,
          port: Number(portFound),
          token: tokenFound,
          homeDir,
          getStdout: () => stdout,
          getStderr: () => stderr,
          waitForExit: () =>
            new Promise((resolveExit) => {
              // Register listener FIRST to avoid race between exit event and exitCode being set
              child.once("exit", (code: number | null) => resolveExit(code));
              if (child.exitCode !== null) {
                resolveExit(child.exitCode);
              }
            }),
        };
        running.push(server);
        resolve(server);
      }
    });

    child.once("error", (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.once("exit", (code: number | null) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Server exited early with code ${code}\n${stderr}`));
      }
    });
  });
}

afterEach(async () => {
  await Promise.all(
    running.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (server.process.exitCode !== null || server.process.killed) {
            rmSync(server.homeDir, { recursive: true, force: true });
            resolve();
            return;
          }

          server.process.once("exit", () => {
            rmSync(server.homeDir, { recursive: true, force: true });
            resolve();
          });
          server.process.kill("SIGTERM");
          setTimeout(() => {
            if (!server.process.killed) {
              server.process.kill("SIGKILL");
            }
          }, 500);
        })
    )
  );
});

function authHeaders(token: string, extra?: Record<string, string>) {
  return { "Authorization": `Bearer ${token}`, ...extra };
}

describe("server/index.ts", () => {
  it("serves GET / without auth", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<");
    expect(html).toContain("__PLANCOP_TOKEN__");
  });

  it("returns 401 for missing/wrong token on /api/plan", async () => {
    const server = await startServer();

    const noAuth = await fetch(`http://127.0.0.1:${server.port}/api/plan`);
    expect(noAuth.status).toBe(401);

    const wrongAuth = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
      headers: { "Authorization": "Bearer wrong-token" },
    });
    expect(wrongAuth.status).toBe(401);
  });

  it("serves GET /api/status", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/status`, {
      headers: authHeaders(server.token),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("serves SSE stream on GET /api/events with token query param", async () => {
    const server = await startServer(undefined, { PLANCOP_SESSION_MODE: "persistent" });
    const response = await fetch(`http://127.0.0.1:${server.port}/api/events?token=${server.token}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
  });

  it("handles POST /api/push-plan and returns decision", async () => {
    const server = await startServer(undefined, { PLANCOP_SESSION_MODE: "persistent" });
    const pushedInput = {
      timestamp: 456,
      cwd: "/tmp/project",
      toolName: "create",
      toolArgs: JSON.stringify({ file: "next.md", content: "# Next Plan" }),
    };

    const pushPromise = fetch(`http://127.0.0.1:${server.port}/api/push-plan`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: JSON.stringify(pushedInput),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const planResponse = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
      headers: authHeaders(server.token),
    });
    const planBody = await planResponse.json();
    expect(planBody).toMatchObject({ plan: "# Next Plan", timestamp: 456 });

    await fetch(`http://127.0.0.1:${server.port}/api/approve`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });

    const pushResponse = await pushPromise;
    expect(pushResponse.status).toBe(200);
    expect(await pushResponse.json()).toEqual({ permissionDecision: "allow" });
  });

  it("serves GET /api/plan", async () => {
    const server = await startServer(
      JSON.stringify({
        timestamp: 123,
        cwd: "/tmp/project",
        toolName: "create",
        toolArgs: JSON.stringify({ file: "plan.md", content: "# New Plan" }),
      })
    );

    const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
      headers: authHeaders(server.token),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      plan: "# New Plan",
      toolName: "create",
      cwd: "/tmp/project",
      timestamp: 123,
    });
    expect(body.toolArgs).toEqual({
      file: "plan.md",
      content: "# New Plan",
      language: "markdown",
    });
  });

  it("serves GET /api/versions and GET /api/version/:id", async () => {
    const server = await startServer();
    const versionsResponse = await fetch(`http://127.0.0.1:${server.port}/api/versions`, {
      headers: authHeaders(server.token),
    });
    const versionResponse = await fetch(`http://127.0.0.1:${server.port}/api/version/1`, {
      headers: authHeaders(server.token),
    });

    expect(versionsResponse.status).toBe(200);
    expect(await versionsResponse.json()).toEqual({ versions: [] });

    expect(versionResponse.status).toBe(200);
    expect(await versionResponse.json()).toEqual({ version: null });
  });

  it("handles POST /api/approve and exits with allow decision", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/approve`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const code = await server.waitForExit();
    expect(code).toBe(0);
    expect(JSON.parse(server.getStdout().trim())).toEqual({ permissionDecision: "allow" });
  });

  it("handles POST /api/deny and exits with deny decision", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/deny`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ reason: "Bad plan" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const code = await server.waitForExit();
    expect(code).toBe(0);
    expect(JSON.parse(server.getStdout().trim())).toEqual({
      permissionDecision: "deny",
      permissionDecisionReason: "Bad plan",
    });
  });

  it("handles OPTIONS preflight with 204 and CORS headers", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
      method: "OPTIONS",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toContain("127.0.0.1");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("returns 404 for unknown routes", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/nonexistent`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("rejects POST /api/push-plan with 400 in ephemeral mode", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/push-plan`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        timestamp: Date.now(),
        cwd: "/tmp",
        toolName: "edit",
        toolArgs: "{}",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "push-plan is only available in persistent mode",
    });
  });

  it("returns 409 for concurrent POST /api/push-plan while one is pending", async () => {
    const server = await startServer(undefined, {
      PLANCOP_SESSION_MODE: "persistent",
    });
    const planPayload = JSON.stringify({
      timestamp: Date.now(),
      cwd: "/tmp/project",
      toolName: "create",
      toolArgs: JSON.stringify({ file: "plan.md", content: "# Plan" }),
    });

    // First push-plan — will block waiting for a decision
    const firstPush = fetch(`http://127.0.0.1:${server.port}/api/push-plan`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: planPayload,
    });

    // Give the first push-plan time to be registered on the server
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second concurrent push-plan should be rejected
    const secondResponse = await fetch(
      `http://127.0.0.1:${server.port}/api/push-plan`,
      {
        method: "POST",
        headers: authHeaders(server.token, { "Content-Type": "application/json" }),
        body: planPayload,
      }
    );
    expect(secondResponse.status).toBe(409);
    expect(await secondResponse.json()).toEqual({
      error: "A plan is already awaiting decision",
    });

    // Clean up: approve the pending first push so the server can exit
    await fetch(`http://127.0.0.1:${server.port}/api/approve`, {
      method: "POST",
      headers: authHeaders(server.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    await firstPush;
  });

  it("settles pending review with deny on SIGTERM in ephemeral mode", async () => {
    const server = await startServer();

    // Don't approve or deny — send SIGTERM while review is pending
    await new Promise((resolve) => setTimeout(resolve, 200));
    server.process.kill("SIGTERM");

    const code = await server.waitForExit();
    expect(code).toBe(0);

    const stdout = server.getStdout().trim();
    expect(stdout).toBeTruthy();
    const decision = JSON.parse(stdout);
    expect(decision).toEqual({
      permissionDecision: "deny",
      permissionDecisionReason: "Review server shutting down — plan denied for safety",
    });
  }, 15_000);

  it("exits with code 1 when PLAN_INPUT is invalid JSON", async () => {
    const child = spawn("./node_modules/.bin/tsx", ["server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAN_INPUT: "{invalid-json",
      },
    });

    let stderr = "";
    child.stderr.on("data", (chunk: unknown) => {
      stderr += String(chunk);
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("exit", (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("plancop server error:");
  }, 30_000);
});
