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
});
