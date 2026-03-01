import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_DIR = join(homedir(), ".plancop");
const PID_FILE = join(SESSION_DIR, "server.pid");
export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

export interface SessionInfo {
  pid: number;
  port: number;
  startedAt: number;
}

function isValidSessionInfo(value: unknown): value is SessionInfo {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Record<string, unknown>;
  return (
    typeof session.pid === "number" &&
    Number.isInteger(session.pid) &&
    session.pid > 0 &&
    typeof session.port === "number" &&
    Number.isInteger(session.port) &&
    session.port > 0 &&
    typeof session.startedAt === "number" &&
    Number.isFinite(session.startedAt)
  );
}

export function ensureSessionDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

export function readPidFile(): SessionInfo | null {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  try {
    const raw = readFileSync(PID_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isValidSessionInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePidFile(info: SessionInfo): void {
  ensureSessionDir();
  writeFileSync(PID_FILE, JSON.stringify(info), "utf8");
}

export function removePidFile(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
  }
}

export function isServerRunning(info: SessionInfo): boolean {
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}
