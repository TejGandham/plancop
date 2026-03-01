import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type StorageVersionsModule = typeof import("../storage-versions.ts");

const cleanupDirs: string[] = [];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function loadStorageWithTempHome(): Promise<{ module: StorageVersionsModule; homeDir: string }> {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "plancop-storage-versions-"));
  cleanupDirs.push(homeDir);

  process.env.HOME = homeDir;
  vi.resetModules();

  return {
    module: await import("../storage-versions.ts"),
    homeDir,
  };
}

afterEach(() => {
  vi.resetModules();
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("storage-versions", () => {
  it("savePlan creates file at expected path", async () => {
    const { module, homeDir } = await loadStorageWithTempHome();
    const cwd = "/home/user/my-project";
    const content = "# Auth Refactor Plan\n\nPlan body";

    const result = module.savePlan(cwd, content);
    const expectedPath = path.join(
      homeDir,
      ".plancop",
      "history",
      "my-project",
      "auth-refactor-plan",
      "v1.md"
    );

    expect(result).toEqual({
      version: 1,
      path: expectedPath,
      deduplicated: false,
    });
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it("savePlan with same content twice keeps one version", async () => {
    const { module, homeDir } = await loadStorageWithTempHome();
    const cwd = "/home/user/my-project";
    const content = "# Auth Refactor Plan\n\nSame plan";

    const first = module.savePlan(cwd, content);
    const second = module.savePlan(cwd, content);
    const versionDir = path.join(homeDir, ".plancop", "history", "my-project", "auth-refactor-plan");

    expect(first.version).toBe(1);
    expect(first.deduplicated).toBe(false);
    expect(second.version).toBe(1);
    expect(second.deduplicated).toBe(true);
    expect(fs.readdirSync(versionDir).filter((entry) => /^v\d+\.md$/.test(entry))).toEqual(["v1.md"]);
  });

  it("savePlan with different content creates v1 and v2", async () => {
    const { module, homeDir } = await loadStorageWithTempHome();
    const cwd = "/home/user/my-project";
    const firstContent = "# Auth Refactor Plan\n\nVersion 1";
    const secondContent = "# Auth Refactor Plan\n\nVersion 2";

    const first = module.savePlan(cwd, firstContent);
    const second = module.savePlan(cwd, secondContent);
    const versionDir = path.join(homeDir, ".plancop", "history", "my-project", "auth-refactor-plan");

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(fs.existsSync(path.join(versionDir, "v1.md"))).toBe(true);
    expect(fs.existsSync(path.join(versionDir, "v2.md"))).toBe(true);
  });

  it("getVersions returns versions with timestamps", async () => {
    const { module } = await loadStorageWithTempHome();
    const cwd = "/home/user/my-project";
    const content = "# Auth Refactor Plan\n\nVersion";

    module.savePlan(cwd, `${content} 1`);
    module.savePlan(cwd, `${content} 2`);

    const versions = module.getVersions(cwd, content);

    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
    expect(versions[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(versions[1].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(versions[0].path.endsWith("v1.md")).toBe(true);
    expect(versions[1].path.endsWith("v2.md")).toBe(true);
  });

  it("getVersion returns content for a specific version", async () => {
    const { module } = await loadStorageWithTempHome();
    const cwd = "/home/user/my-project";
    const v1 = "# Auth Refactor Plan\n\nVersion A";
    const v2 = "# Auth Refactor Plan\n\nVersion B";

    module.savePlan(cwd, v1);
    module.savePlan(cwd, v2);

    expect(module.getVersion(cwd, v1, 1)).toBe(v1);
    expect(module.getVersion(cwd, v1, 2)).toBe(v2);
    expect(module.getVersion(cwd, v1, 3)).toBeNull();
  });

  it("projectSlug extracts basename from path", async () => {
    const { module } = await loadStorageWithTempHome();
    expect(module.projectSlug("/home/user/my-project")).toBe("my-project");
  });

  it("planSlug uses first H1 heading", async () => {
    const { module } = await loadStorageWithTempHome();
    expect(module.planSlug("# Auth Refactor Plan\n\nBody")).toBe("auth-refactor-plan");
  });

  it("planSlug without heading uses first 50 chars kebab-cased", async () => {
    const { module } = await loadStorageWithTempHome();
    const content = "This plan has no heading and should use first fifty chars for slug generation.";
    const expected = slugify(content.slice(0, 50));

    expect(module.planSlug(content)).toBe(expected);
  });

  it("contentHash is deterministic", async () => {
    const { module } = await loadStorageWithTempHome();
    const content = "# Same\n\ncontent";

    expect(module.contentHash(content)).toBe(module.contentHash(content));
    expect(module.contentHash(content)).toMatch(/^[a-f0-9]{16}$/);
  });

  it("slugs handle special characters", async () => {
    const { module } = await loadStorageWithTempHome();
    expect(module.projectSlug("/tmp/My Cool Project!!")).toBe("my-cool-project");
  });
});
