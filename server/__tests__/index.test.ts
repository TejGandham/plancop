// @ts-nocheck
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type RunningServer = {
  process: ChildProcessWithoutNullStreams;
  port: number;
  getStdout: () => string;
  getStderr: () => string;
  waitForExit: () => Promise<number | null>;
};

const running: RunningServer[] = [];

function startServer(planInput?: string): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--experimental-strip-types", "server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
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
            resolve();
            return;
          }

          server.process.once("exit", () => resolve());
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
    expect(await response.json()).toEqual({ ok: true });
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
