import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type SessionModule = typeof import("../session.ts");

async function loadSessionModule(): Promise<SessionModule> {
  vi.resetModules();
  return import("../session.ts");
}

let originalHome = "";
let tempHome = "";

beforeEach(() => {
  originalHome = process.env.HOME ?? "";
  tempHome = mkdtempSync(join(tmpdir(), "plancop-session-home-"));
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
});

describe("server/session.ts", () => {
  it("ensureSessionDir creates ~/.plancop", async () => {
    const session = await loadSessionModule();
    const sessionDir = join(tempHome, ".plancop");

    expect(existsSync(sessionDir)).toBe(false);
    session.ensureSessionDir();
    expect(existsSync(sessionDir)).toBe(true);
  });

  it("writePidFile writes expected JSON payload", async () => {
    const session = await loadSessionModule();
    const pidFile = join(tempHome, ".plancop", "server.pid");
    const info = { pid: 12345, port: 54321, startedAt: 1700000000000, token: "test-token-abc" };

    session.writePidFile(info);

    expect(existsSync(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf8")).toBe(JSON.stringify(info));
  });

  it("writePidFile sets restrictive file permissions", async () => {
    const { statSync } = await import("node:fs");
    const session = await loadSessionModule();
    const pidFile = join(tempHome, ".plancop", "server.pid");
    const info = { pid: 12345, port: 54321, startedAt: 1700000000000, token: "secret" };

    session.writePidFile(info);

    const mode = statSync(pidFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("readPidFile returns SessionInfo for valid file", async () => {
    const session = await loadSessionModule();
    const info = { pid: 321, port: 8080, startedAt: 1700000001111, token: "tok-123" };

    session.writePidFile(info);

    expect(session.readPidFile()).toEqual(info);
  });

  it("readPidFile returns SessionInfo without token (backwards compat)", async () => {
    const session = await loadSessionModule();
    const info = { pid: 321, port: 8080, startedAt: 1700000001111 };

    session.writePidFile(info);

    expect(session.readPidFile()).toEqual(info);
  });

  it("readPidFile returns null when file is missing", async () => {
    const session = await loadSessionModule();
    expect(session.readPidFile()).toBeNull();
  });

  it("readPidFile returns null when JSON is invalid", async () => {
    const session = await loadSessionModule();
    session.ensureSessionDir();
    writeFileSync(join(tempHome, ".plancop", "server.pid"), "{not-json", "utf8");

    expect(session.readPidFile()).toBeNull();
  });

  it("readPidFile returns null when payload shape is invalid", async () => {
    const session = await loadSessionModule();
    session.ensureSessionDir();
    writeFileSync(
      join(tempHome, ".plancop", "server.pid"),
      JSON.stringify({ pid: "oops", port: 3000, startedAt: 1 }),
      "utf8"
    );

    expect(session.readPidFile()).toBeNull();
  });

  it("removePidFile deletes the PID file", async () => {
    const session = await loadSessionModule();
    const pidFile = join(tempHome, ".plancop", "server.pid");

    session.writePidFile({ pid: 1, port: 2, startedAt: 3 });
    expect(existsSync(pidFile)).toBe(true);

    session.removePidFile();

    expect(existsSync(pidFile)).toBe(false);
  });

  it("isServerRunning returns true for current process", async () => {
    const session = await loadSessionModule();
    expect(session.isServerRunning({ pid: process.pid, port: 1234, startedAt: Date.now() })).toBe(true);
  });

  it("isServerRunning returns false for non-existent process", async () => {
    const session = await loadSessionModule();
    expect(session.isServerRunning({ pid: 99999999, port: 1234, startedAt: Date.now() })).toBe(false);
  });
});
