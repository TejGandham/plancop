/**
 * Cross-platform browser opening utility
 */

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import os from "node:os";

/**
 * Check if running in WSL (Windows Subsystem for Linux)
 */
async function isWSL(): Promise<boolean> {
  if (process.platform !== "linux") {
    return false;
  }

  if (os.release().toLowerCase().includes("microsoft")) {
    return true;
  }

  // Fallback: check /proc/version for WSL signature (if available)
  try {
    if (existsSync("/proc/version")) {
      const content = readFileSync("/proc/version", "utf-8");
      return (
        content.toLowerCase().includes("wsl") ||
        content.toLowerCase().includes("microsoft")
      );
    }
  } catch {
    // Ignore errors reading /proc/version
  }
  return false;
}

/**
 * Spawn a detached process for browser opening (fire-and-forget).
 * Returns true if the process was spawned without immediate error.
 */
function spawnBrowser(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      child.on("error", () => resolve(false));
      // Give the spawn a moment to detect immediate errors (e.g., ENOENT)
      setTimeout(() => resolve(true), 100);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Open a URL in the browser
 *
 * Uses PLANNOTATOR_BROWSER env var if set, otherwise uses system default.
 * - macOS: Set to app name ("Google Chrome") or path ("/Applications/Firefox.app")
 * - Linux/Windows/WSL: Set to executable path ("/usr/bin/firefox")
 *
 * Fails silently if browser can't be opened
 */
export async function openBrowser(url: string): Promise<boolean> {
  try {
    const browser = process.env.PLANNOTATOR_BROWSER || process.env.BROWSER;
    const platform = process.platform;
    const wsl = await isWSL();

    if (browser) {
      const plannotatorBrowser = process.env.PLANNOTATOR_BROWSER;
      if (plannotatorBrowser && platform === "darwin") {
        return spawnBrowser("open", ["-a", plannotatorBrowser, url]);
      } else if ((platform === "win32" || wsl) && plannotatorBrowser) {
        return spawnBrowser("cmd.exe", ["/c", "start", "", plannotatorBrowser, url]);
      } else {
        return spawnBrowser(browser, [url]);
      }
    } else {
      // Default system browser
      if (platform === "win32" || wsl) {
        return spawnBrowser("cmd.exe", ["/c", "start", url]);
      } else if (platform === "darwin") {
        return spawnBrowser("open", [url]);
      } else {
        return spawnBrowser("xdg-open", [url]);
      }
    }
  } catch {
    return false;
  }
}
