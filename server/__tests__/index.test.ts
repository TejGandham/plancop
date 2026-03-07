// @ts-nocheck
// @vitest-environment node
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

function startServer(planContent?: string): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const homeDir = mkdtempSync(join(tmpdir(), "plancop-index-test-home-"));
    const stdinPayload = JSON.stringify({
      tool_input: { plan: planContent ?? "# Test Plan\n\nSome content" },
      permission_mode: "default",
    });

    const child = spawn("bun", ["run", "server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
      },
    });

    // Write stdin payload and close
    child.stdin.write(stdinPayload);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk: unknown) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk: unknown) => {
      stderr += String(chunk);
      const portMatch = stderr.match(/http:\/\/localhost:(\d+)/);
      const tokenMatch = stderr.match(/PLANCOP_TOKEN:([^\s]+)/);
      if (portMatch && tokenMatch && !settled) {
        settled = true;
        const server: RunningServer = {
          process: child,
          port: Number(portMatch[1]),
          token: tokenMatch[1],
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
          }, 2000);
        })
    )
  );
});

describe("server/index.ts (ExitPlanMode)", () => {
  it("serves GET / without auth and injects token", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<");
    expect(html).toContain("__PLANCOP_TOKEN__");
  });

  it("returns 401 for missing or wrong token on /api/* routes", async () => {
    const server = await startServer();

    const noAuth = await fetch(`http://127.0.0.1:${server.port}/api/plan`);
    expect(noAuth.status).toBe(401);

    const wrongAuth = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
      headers: { "Authorization": "Bearer wrong-token" },
    });
    expect(wrongAuth.status).toBe(401);
  });

  it("serves GET /api/plan with ExitPlanMode data", async () => {
    const server = await startServer("# My Plan\n\nDo the thing");
    const response = await fetch(`http://127.0.0.1:${server.port}/api/plan`, {
      headers: { "Authorization": `Bearer ${server.token}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      plan: "# My Plan\n\nDo the thing",
      origin: "claude-code",
      permissionMode: "default",
    });
  });

  it("handles POST /api/approve and outputs PermissionRequest allow", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/approve`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${server.token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const code = await server.waitForExit();
    expect(code).toBe(0);

    const output = JSON.parse(server.getStdout().trim());
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
  });

  it("handles POST /api/deny and outputs PermissionRequest deny", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/deny`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${server.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Needs changes" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const code = await server.waitForExit();
    expect(code).toBe(0);

    const output = JSON.parse(server.getStdout().trim());
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", message: "Needs changes" },
      },
    });
  });

  it("handles POST /api/feedback same as /api/deny", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/api/feedback`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${server.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "Fix the auth section" }),
    });

    expect(response.status).toBe(200);

    const code = await server.waitForExit();
    expect(code).toBe(0);

    const output = JSON.parse(server.getStdout().trim());
    expect(output.hookSpecificOutput.decision).toEqual({
      behavior: "deny",
      message: "Fix the auth section",
    });
  });

  it("returns 404 for unknown routes", async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/nonexistent`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("settles pending review with deny on SIGTERM", async () => {
    const server = await startServer();

    // Don't approve or deny — send SIGTERM while review is pending
    await new Promise((resolve) => setTimeout(resolve, 200));
    server.process.kill("SIGTERM");

    const code = await server.waitForExit();
    expect(code).toBe(0);

    const stdout = server.getStdout().trim();
    expect(stdout).toBeTruthy();
    const output = JSON.parse(stdout);
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: {
          behavior: "deny",
          message: "Review server shutting down \u2014 plan denied for safety",
        },
      },
    });
  }, 15_000);

  it("exits with code 1 when stdin has invalid JSON", async () => {
    const child = spawn("bun", ["run", "server/index.ts"], {
      cwd: process.cwd(),
    });

    child.stdin.write("{invalid-json");
    child.stdin.end();

    let stderr = "";
    child.stderr.on("data", (chunk: unknown) => {
      stderr += String(chunk);
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("exit", (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("plancop:");
  }, 15_000);

  it("exits with code 1 when plan is empty", async () => {
    const child = spawn("bun", ["run", "server/index.ts"], {
      cwd: process.cwd(),
    });

    child.stdin.write(JSON.stringify({ tool_input: { plan: "" } }));
    child.stdin.end();

    let stderr = "";
    child.stderr.on("data", (chunk: unknown) => {
      stderr += String(chunk);
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("exit", (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("plancop:");
  }, 15_000);
});
