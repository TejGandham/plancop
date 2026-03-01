/**
 * Utility function tests for ported Node.js implementations.
 *
 * Tests: readFile (storage), writeFile (storage), gitDiff (git), openBrowser (browser)
 */

import { describe, expect, test, beforeAll, afterAll, vi } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

// --- Storage tests (readFile / writeFile via savePlan, getPlanVersion) ---

import { savePlan, getPlanDir, generateSlug, saveFinalSnapshot, saveAnnotations } from "../storage";

describe("storage — readFile / writeFile", () => {
  const testDir = join(tmpdir(), `plancop-test-${Date.now()}`);

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  test("getPlanDir creates directory and returns path", () => {
    const dir = getPlanDir(testDir);
    expect(dir).toBe(testDir);
    expect(existsSync(dir)).toBe(true);
  });

  test("savePlan writes file and returns path", () => {
    const slug = "test-plan";
    const content = "# Test Plan\n\nSome content here.";
    const filePath = savePlan(slug, content, testDir);

    expect(filePath).toBe(join(testDir, "test-plan.md"));
    expect(existsSync(filePath)).toBe(true);

    const read = readFileSync(filePath, "utf-8");
    expect(read).toBe(content);
  });

  test("saveAnnotations writes annotations file", () => {
    const slug = "test-plan";
    const annotations = "## Annotations\n\nLine 1: looks good";
    const filePath = saveAnnotations(slug, annotations, testDir);

    expect(filePath).toBe(join(testDir, "test-plan.annotations.md"));
    const read = readFileSync(filePath, "utf-8");
    expect(read).toBe(annotations);
  });

  test("saveFinalSnapshot combines plan and annotations", () => {
    const plan = "# My Plan";
    const annotations = "## Notes";
    const filePath = saveFinalSnapshot("test-plan", "approved", plan, annotations, testDir);

    expect(filePath).toContain("test-plan-approved.md");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("# My Plan");
    expect(content).toContain("## Notes");
    expect(content).toContain("---");
  });

  test("saveFinalSnapshot skips annotations when 'No changes detected.'", () => {
    const plan = "# My Plan";
    const filePath = saveFinalSnapshot("test-plan-2", "denied", plan, "No changes detected.", testDir);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe("# My Plan");
    expect(content).not.toContain("---");
  });

  test("generateSlug creates date-based slug from heading", () => {
    const slug = generateSlug("# My Cool Plan\n\nContent");
    expect(slug).toMatch(/^my-cool-plan-\d{4}-\d{2}-\d{2}$/);
  });

  test("generateSlug falls back to 'plan-' prefix when no heading", () => {
    const slug = generateSlug("No heading here");
    expect(slug).toMatch(/^plan-\d{4}-\d{2}-\d{2}$/);
  });
});

// --- Git diff tests ---

import { getCurrentBranch, getDefaultBranch, runGitDiff } from "../git";

describe("git — diff utilities", () => {
  test("getCurrentBranch returns a string", async () => {
    const branch = await getCurrentBranch();
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });

  test("getDefaultBranch returns main or master", async () => {
    const defaultBranch = await getDefaultBranch();
    expect(["main", "master"]).toContain(defaultBranch);
  });

  test("runGitDiff uncommitted returns DiffResult with patch and label", async () => {
    const result = await runGitDiff("uncommitted");
    expect(result).toHaveProperty("patch");
    expect(result).toHaveProperty("label");
    expect(typeof result.patch).toBe("string");
    expect(result.label).toBe("Uncommitted changes");
  });

  test("runGitDiff staged returns DiffResult", async () => {
    const result = await runGitDiff("staged");
    expect(result.label).toBe("Staged changes");
  });

  test("runGitDiff unstaged returns DiffResult", async () => {
    const result = await runGitDiff("unstaged");
    expect(result.label).toBe("Unstaged changes");
  });

  test("runGitDiff last-commit returns DiffResult", async () => {
    const result = await runGitDiff("last-commit");
    expect(result.label).toBe("Last commit");
  });

  test("runGitDiff branch returns DiffResult", async () => {
    const result = await runGitDiff("branch", "main");
    expect(result.label).toContain("vs main");
  });

  test("runGitDiff unknown type returns empty patch", async () => {
    const result = await runGitDiff("unknown-type" as any);
    expect(result.patch).toBe("");
    expect(result.label).toBe("Unknown diff type");
  });
});

// --- Browser tests ---

import { openBrowser } from "../browser";

describe("browser — openBrowser", () => {
  test("openBrowser is a function that returns Promise<boolean>", () => {
    expect(typeof openBrowser).toBe("function");
  });

  // Cannot actually open a browser in CI, but we test the function doesn't throw
  test("openBrowser returns boolean (true or false)", async () => {
    // With an invalid URL/command, should return false gracefully
    const result = await openBrowser("http://localhost:99999/nonexistent");
    expect(typeof result).toBe("boolean");
  });
});

// --- Project detection tests (ported from project.test.ts) ---

import { sanitizeTag, extractRepoName, extractDirName, detectProjectName } from "../project";

describe("project — sanitizeTag", () => {
  test("lowercases input", () => {
    expect(sanitizeTag("MyProject")).toBe("myproject");
  });

  test("replaces spaces with hyphens", () => {
    expect(sanitizeTag("my project")).toBe("my-project");
  });

  test("replaces underscores with hyphens", () => {
    expect(sanitizeTag("my_project")).toBe("my-project");
  });

  test("removes special characters", () => {
    expect(sanitizeTag("my@project!name")).toBe("myprojectname");
  });

  test("collapses multiple hyphens", () => {
    expect(sanitizeTag("my--project")).toBe("my-project");
  });

  test("trims to 30 chars", () => {
    const long = "a".repeat(50);
    expect(sanitizeTag(long)?.length).toBe(30);
  });

  test("returns null for empty string", () => {
    expect(sanitizeTag("")).toBeNull();
  });

  test("returns null for single char", () => {
    expect(sanitizeTag("a")).toBeNull();
  });

  test("returns null for null/undefined", () => {
    expect(sanitizeTag(null as unknown as string)).toBeNull();
    expect(sanitizeTag(undefined as unknown as string)).toBeNull();
  });
});

describe("project — extractRepoName", () => {
  test("extracts name from full path", () => {
    expect(extractRepoName("/Users/dev/projects/my-app")).toBe("my-app");
  });

  test("handles trailing slash", () => {
    expect(extractRepoName("/Users/dev/my-app/")).toBe("my-app");
  });

  test("returns null for empty string", () => {
    expect(extractRepoName("")).toBeNull();
  });
});

describe("project — extractDirName", () => {
  test("extracts directory name", () => {
    expect(extractDirName("/home/user/workspace")).toBe("workspace");
  });

  test("skips generic names", () => {
    expect(extractDirName("/home")).toBeNull();
    expect(extractDirName("/root")).toBeNull();
    expect(extractDirName("/tmp")).toBeNull();
  });

  test("returns null for root path", () => {
    expect(extractDirName("/")).toBeNull();
  });
});

describe("project — detectProjectName", () => {
  test("returns a string or null", async () => {
    const result = await detectProjectName();
    expect(result === null || typeof result === "string").toBe(true);
  });

  test("result is sanitized if not null", async () => {
    const result = await detectProjectName();
    if (result) {
      expect(result).toMatch(/^[a-z0-9-]+$/);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(30);
    }
  });
});
