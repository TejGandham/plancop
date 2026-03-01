// @ts-nocheck
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type RunningServer = {
  process: ChildProcessWithoutNullStreams;
  port: number;
  homeDir: string;
  getStdout: () => string;
  getStderr: () => string;
  waitForExit: () => Promise<number | null>;
};

const running: RunningServer[] = [];

function startServer(planInput?: string, extraEnv: Record<string, string> = {}): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const homeDir = mkdtempSync(join(tmpdir(), "plancop-index-test-home-"));
    const child = spawn("npx", ["tsx", "server/index.ts"], {
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

    child.stderr.on("data", (chunk: unknown) => {
      stderr += String(chunk);
      const match = stderr.match(/PLANCOP_PORT:(\d+)/);
      if (match && !settled) {
        settled = true;
        const server: RunningServer = {
          process: child,
          port: Number(match[1]),
          homeDir,
          getStdout: () => stdout,
          getStderr: () => stderr,
          waitForExit: () =>
            new Promise((resolveExit) => {
              if (child.exitCode !== null) {
                resolveExit(child.exitCode);
                return;
              }
              child.once("exit", (code: number | null) => resolveExit(code));
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

describe("server/index.ts", () => {
  it("serves GET /", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<");
  });

  it("serves GET /api/status", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/status`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("serves SSE stream on GET /api/events", async () => {
    const server = await startServer(undefined, { PLANCOP_SESSION_MODE: "persistent" });
    const response = await fetch(`http://127.0.0.1:${server.port}/api/events`);

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pushedInput),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const planResponse = await fetch(`http://127.0.0.1:${server.port}/api/plan`);
    const planBody = await planResponse.json();
    expect(planBody).toMatchObject({ plan: "# Next Plan", timestamp: 456 });

    await fetch(`http://127.0.0.1:${server.port}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`);
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
    const versionsResponse = await fetch(`http://127.0.0.1:${server.port}/api/versions`);
    const versionResponse = await fetch(`http://127.0.0.1:${server.port}/api/version/1`);

    expect(versionsResponse.status).toBe(200);
    expect(await versionsResponse.json()).toEqual({ versions: [] });

    expect(versionResponse.status).toBe(200);
    expect(await versionResponse.json()).toEqual({ version: null });
  });

  it("handles POST /api/approve and exits with allow decision", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
});
