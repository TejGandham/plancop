/**
 * Repository Info Detection
 *
 * Detects org/repo from git remote with fallback chain.
 * Priority: org/repo from remote → repo name → directory name
 */

import { spawnSync } from "child_process";

export interface RepoInfo {
  /** Display string (e.g., "backnotprop/plannotator" or "my-project") */
  display: string;
  /** Current git branch (if in a git repo) */
  branch?: string;
}

/**
 * Parse org/repo from a git remote URL
 *
 * Handles:
 * - SSH: git@github.com:org/repo.git
 * - HTTPS: https://github.com/org/repo.git
 * - SSH with port: ssh://git@github.com:22/org/repo.git
 */
function parseRemoteUrl(url: string): string | null {
  if (!url) return null;

  // SSH format: git@github.com:org/repo.git
  const sshMatch = url.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS format: https://github.com/org/repo.git
  const httpsMatch = url.match(/\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

/**
 * Get directory name from path
 */
function getDirName(path: string): string | null {
  if (!path) return null;
  const trimmed = path.trim().replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Get current git branch
 */
async function getCurrentBranch(): Promise<string | undefined> {
  try {
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.status === 0 && result.stdout) {
      const branch = result.stdout.trim();
      return branch && branch !== "HEAD" ? branch : undefined;
    }
  } catch {
    // Not in a git repo
  }
  return undefined;
}

/**
 * Detect repository info with fallback chain
 *
 * 1. Try org/repo from git remote origin
 * 2. Fall back to git repo root directory name
 * 3. Fall back to current working directory name
 */
export async function getRepoInfo(): Promise<RepoInfo | null> {
  let branch: string | undefined;

  // Try git remote URL first
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.status === 0 && result.stdout) {
      const orgRepo = parseRemoteUrl(result.stdout.trim());
      if (orgRepo) {
        branch = await getCurrentBranch();
        return { display: orgRepo, branch };
      }
    }
  } catch {
    // Git not available
  }

  // Fallback: git repo root name
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.status === 0 && result.stdout) {
      const repoName = getDirName(result.stdout.toString());
      if (repoName) {
        branch = await getCurrentBranch();
        return { display: repoName, branch };
      }
    }
  } catch {
    // Not in a git repo
  }

  // Final fallback: current directory (no branch - not a git repo)
  try {
    const dirName = getDirName(process.cwd());
    if (dirName) {
      return { display: dirName };
    }
  } catch {
    // Shouldn't happen
  }

  return null;
}
