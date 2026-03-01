/**
 * Git utilities for code review
 *
 * Centralized git operations for diff collection and branch detection.
 * Used by both Claude Code hook and OpenCode plugin.
 */

import { execFileSync, spawnSync } from "child_process";

export type DiffType =
  | "uncommitted"
  | "staged"
  | "unstaged"
  | "last-commit"
  | "branch";

export interface DiffOption {
  id: DiffType | "separator";
  label: string;
}

export interface GitContext {
  currentBranch: string;
  defaultBranch: string;
  diffOptions: DiffOption[];
}

export interface DiffResult {
  patch: string;
  label: string;
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const stdout = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return stdout.trim();
  } catch {
    return "HEAD"; // Detached HEAD state
  }
}

/**
 * Detect the default branch (main, master, etc.)
 *
 * Strategy:
 * 1. Check origin's HEAD reference
 * 2. Fallback to checking if 'main' exists
 * 3. Final fallback to 'master'
 */
export async function getDefaultBranch(): Promise<string> {
  // Try origin's HEAD first (most reliable for repos with remotes)
  try {
    const stdout = execFileSync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      { encoding: "utf-8", stdio: "pipe" }
    );
    const ref = stdout.trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    // No remote or no HEAD set - check local branches
  }

  // Fallback: check if main exists locally
  const result = spawnSync("git", ["show-ref", "--verify", "refs/heads/main"], {
    encoding: "utf-8",
    stdio: "pipe",
  });
  if (result.status === 0) {
    return "main";
  }

  // Final fallback
  return "master";
}

/**
 * Get git context including branch info and available diff options
 */
export async function getGitContext(): Promise<GitContext> {
  const [currentBranch, defaultBranch] = await Promise.all([
    getCurrentBranch(),
    getDefaultBranch(),
  ]);

  const diffOptions: DiffOption[] = [
    { id: "uncommitted", label: "Uncommitted changes" },
    { id: "last-commit", label: "Last commit" },
  ];

  // Only show branch diff if not on default branch
  if (currentBranch !== defaultBranch) {
    diffOptions.push({ id: "branch", label: `vs ${defaultBranch}` });
  }

  return { currentBranch, defaultBranch, diffOptions };
}

/**
 * Run git diff with the specified type
 */
export async function runGitDiff(
  diffType: DiffType,
  defaultBranch: string = "main"
): Promise<DiffResult> {
  let patch: string;
  let label: string;

  try {
    switch (diffType) {
      case "uncommitted":
        patch = execFileSync("git", ["diff", "HEAD"], {
          encoding: "utf-8",
          stdio: "pipe",
        });
        label = "Uncommitted changes";
        break;

      case "staged":
        patch = execFileSync("git", ["diff", "--staged"], {
          encoding: "utf-8",
          stdio: "pipe",
        });
        label = "Staged changes";
        break;

      case "unstaged":
        patch = execFileSync("git", ["diff"], {
          encoding: "utf-8",
          stdio: "pipe",
        });
        label = "Unstaged changes";
        break;

      case "last-commit":
        patch = execFileSync("git", ["diff", "HEAD~1..HEAD"], {
          encoding: "utf-8",
          stdio: "pipe",
        });
        label = "Last commit";
        break;

      case "branch":
        patch = execFileSync("git", ["diff", `${defaultBranch}..HEAD`], {
          encoding: "utf-8",
          stdio: "pipe",
        });
        label = `Changes vs ${defaultBranch}`;
        break;

      default:
        patch = "";
        label = "Unknown diff type";
    }
  } catch (error) {
    // Handle errors gracefully (e.g., no commits yet, invalid ref)
    process.stderr.write(`Git diff error for ${diffType}: ${error}\n`);
    patch = "";
    label = `Error: ${diffType}`;
  }

  return { patch, label };
}
