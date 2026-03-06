import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

type RunningMcpServer = {
  process: ChildProcessWithoutNullStreams;
  sendRaw: (raw: string) => void;
  send: (request: JsonRpcRequest) => void;
  waitForResponse: (id: number | string | null, timeoutMs?: number) => Promise<JsonRpcResponse>;
};

const runningServers: ChildProcessWithoutNullStreams[] = [];

function startServer(): RunningMcpServer {
  const child = spawn("node", ["mcp/server.js"], { cwd: process.cwd() });
  runningServers.push(child);

  let stdoutBuffer = "";
  const responses: JsonRpcResponse[] = [];

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      responses.push(JSON.parse(line) as JsonRpcResponse);
    }
  });

  return {
    process: child,
    sendRaw: (raw: string) => {
      child.stdin.write(raw);
    },
    send: (request: JsonRpcRequest) => {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    },
    waitForResponse: (id: number | string | null, timeoutMs = 2000) =>
      new Promise((resolve, reject) => {
        const start = Date.now();

        const check = () => {
          const index = responses.findIndex((response) => response.id === id);
          if (index >= 0) {
            const [response] = responses.splice(index, 1);
            resolve(response);
            return;
          }

          if (child.exitCode !== null) {
            reject(new Error(`MCP server exited with code ${child.exitCode}`));
            return;
          }

          if (Date.now() - start >= timeoutMs) {
            reject(new Error(`Timed out waiting for response id=${String(id)}`));
            return;
          }

          setTimeout(check, 10);
        };

        check();
      }),
  };
}

afterEach(async () => {
  await Promise.all(
    runningServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (server.exitCode !== null || server.killed) {
            resolve();
            return;
          }

          server.once("exit", () => resolve());
          server.kill("SIGTERM");
          setTimeout(() => {
            if (!server.killed) {
              server.kill("SIGKILL");
            }
          }, 500);
        })
    )
  );
});

describe("mcp/server.js", () => {
  it("returns protocol version and capabilities from initialize", async () => {
    const server = startServer();

    server.send({
      jsonrpc: "2.0",
      method: "initialize",
      id: 1,
      params: { capabilities: {} },
    });

    const response = await server.waitForResponse(1);
    expect(response.error).toBeUndefined();
    expect(response.result).toMatchObject({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "plancop", version: "1.0.0" },
    });
  });

  it("returns submit_plan tool from tools/list", async () => {
    const server = startServer();

    server.send({ jsonrpc: "2.0", method: "tools/list", id: 2 });

    const response = await server.waitForResponse(2);
    expect(response.error).toBeUndefined();
    expect(response.result).toMatchObject({
      tools: [
        {
          name: "submit_plan",
          inputSchema: {
            type: "object",
            required: ["plan"],
          },
        },
      ],
    });
  });

  it("returns error for unknown tool in tools/call", async () => {
    const server = startServer();

    server.send({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 3,
      params: { name: "unknown_tool", arguments: {} },
    });

    const response = await server.waitForResponse(3);
    expect(response.error).toMatchObject({
      code: -32602,
      message: "Unknown tool: unknown_tool",
    });
  });

  it("returns parse error for invalid JSON", async () => {
    const server = startServer();

    server.sendRaw("{invalid-json}\n");

    const response = await server.waitForResponse(null);
    expect(response.error).toMatchObject({ code: -32700, message: "Parse error" });
  });

  it("returns method not found for unknown method", async () => {
    const server = startServer();

    server.send({ jsonrpc: "2.0", method: "unknown/method", id: 4 });

    const response = await server.waitForResponse(4);
    expect(response.error).toMatchObject({
      code: -32601,
      message: "Method not found: unknown/method",
    });
  });

  it("does not respond to notifications/initialized", async () => {
    const server = startServer();

    server.send({ jsonrpc: "2.0", method: "notifications/initialized" });

    await expect(server.waitForResponse(null, 150)).rejects.toThrow("Timed out");
  });

  function waitForReviewServer(stderrText: { value: string }): Promise<{ port: number; token: string }> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const portMatch = stderrText.value.match(
          /plancop-mcp: Review UI at http:\/\/127\.0\.0\.1:(\d+)/
        );
        const tokenMatch = stderrText.value.match(/PLANCOP_TOKEN:([^\s]+)/);
        if (portMatch && tokenMatch) return resolve({ port: Number(portMatch[1]), token: tokenMatch[1] });
        if (Date.now() - start > 10_000)
          return reject(new Error("Timed out waiting for review server"));
        setTimeout(check, 50);
      };
      check();
    });
  }

  it("submit_plan: approve flow resolves with { approved: true }", async () => {
    const server = startServer();

    const stderrText = { value: "" };
    server.process.stderr.setEncoding("utf8");
    server.process.stderr.on("data", (chunk: string) => {
      stderrText.value += chunk;
    });

    server.send({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 10,
      params: { name: "submit_plan", arguments: { plan: "# Test Plan\n\nSome content." } },
    });

    const { port: reviewPort, token } = await waitForReviewServer(stderrText);

    // Approve immediately so the test doesn't time out
    const approveResp = await fetch(
      `http://127.0.0.1:${reviewPort}/api/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({}),
      }
    );
    expect(approveResp.status).toBe(200);

    // Wait for MCP to respond
    const response = await server.waitForResponse(10, 5_000);
    expect(response.error).toBeUndefined();
    const result = JSON.parse(
      (response.result as { content: { text: string }[] }).content[0].text
    );
    expect(result).toEqual({ approved: true });
  }, 30_000);

  it("submit_plan: deny flow resolves with { approved: false, feedback }", async () => {
    const server = startServer();

    const stderrText = { value: "" };
    server.process.stderr.setEncoding("utf8");
    server.process.stderr.on("data", (chunk: string) => {
      stderrText.value += chunk;
    });

    server.send({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 11,
      params: { name: "submit_plan", arguments: { plan: "# Draft Plan" } },
    });

    const { port: reviewPort, token } = await waitForReviewServer(stderrText);

    // Deny with a specific reason
    const denyResp = await fetch(`http://127.0.0.1:${reviewPort}/api/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ reason: "Needs more detail" }),
    });
    expect(denyResp.status).toBe(200);

    const response = await server.waitForResponse(11, 5_000);
    expect(response.error).toBeUndefined();
    const result = JSON.parse(
      (response.result as { content: { text: string }[] }).content[0].text
    );
    expect(result).toEqual({ approved: false, feedback: "Needs more detail" });
  }, 30_000);

  it("submit_plan: empty plan string is handled and returns approved result", async () => {
    const server = startServer();

    const stderrText = { value: "" };
    server.process.stderr.setEncoding("utf8");
    server.process.stderr.on("data", (chunk: string) => {
      stderrText.value += chunk;
    });

    server.send({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 12,
      params: { name: "submit_plan", arguments: { plan: "" } },
    });

    const { port: reviewPort, token } = await waitForReviewServer(stderrText);

    await fetch(`http://127.0.0.1:${reviewPort}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({}),
    });

    const response = await server.waitForResponse(12, 5_000);
    expect(response.error).toBeUndefined();
    const result = JSON.parse(
      (response.result as { content: { text: string }[] }).content[0].text
    );
    expect(result).toEqual({ approved: true });
  }, 30_000);

  it("submit_plan: returns 401 without auth token", async () => {
    const server = startServer();

    const stderrText = { value: "" };
    server.process.stderr.setEncoding("utf8");
    server.process.stderr.on("data", (chunk: string) => {
      stderrText.value += chunk;
    });

    server.send({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 13,
      params: { name: "submit_plan", arguments: { plan: "# Auth Test" } },
    });

    const { port: reviewPort } = await waitForReviewServer(stderrText);

    const noAuthResp = await fetch(`http://127.0.0.1:${reviewPort}/api/plan`);
    expect(noAuthResp.status).toBe(401);
  }, 30_000);
});
