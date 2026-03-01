import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  DEFAULT_CONFIG,
  loadConfig,
  shouldInterceptWithConfig,
  mergeConfigs,
  type PlancopConfig,
} from "../config.js";

describe("DEFAULT_CONFIG", () => {
  it("has correct default intercept list", () => {
    expect(DEFAULT_CONFIG.intercept).toEqual(["edit", "create", "write"]);
  });

  it("has correct default ignore list", () => {
    expect(DEFAULT_CONFIG.ignore).toEqual(["read", "ls", "view"]);
  });

  it("has empty autoApprove list", () => {
    expect(DEFAULT_CONFIG.autoApprove).toEqual([]);
  });

  it("has dark theme by default", () => {
    expect(DEFAULT_CONFIG.theme).toBe("dark");
  });
});

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "plancop-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("reads project config from .plancop/config.json", () => {
    const configDir = join(tempDir, ".plancop");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({ intercept: ["bash"], theme: "light" })
    );

    const config = loadConfig(tempDir);
    expect(config.intercept).toEqual(["bash"]);
    expect(config.theme).toBe("light");
    // Non-overridden fields keep defaults
    expect(config.ignore).toEqual(DEFAULT_CONFIG.ignore);
    expect(config.autoApprove).toEqual(DEFAULT_CONFIG.autoApprove);
  });

  it("falls back to defaults for invalid JSON", () => {
    const configDir = join(tempDir, ".plancop");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), "not valid json {{{");

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("plancop: invalid config")
    );
    stderrSpy.mockRestore();
  });

  it("project config overrides global config", () => {
    // Create a "global" dir to simulate HOME
    const fakeHome = mkdtempSync(join(tmpdir(), "plancop-home-test-"));
    const globalDir = join(fakeHome, ".plancop");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "config.json"),
      JSON.stringify({ intercept: ["bash"], theme: "light" })
    );

    // Create project config that overrides intercept but not theme
    const projectDir = join(tempDir, ".plancop");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "config.json"),
      JSON.stringify({ intercept: ["edit", "create"] })
    );

    const config = loadConfig(tempDir, fakeHome);
    // Project intercept wins over global
    expect(config.intercept).toEqual(["edit", "create"]);
    // Global theme wins over default (project didn't set it)
    expect(config.theme).toBe("light");

    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("uses global config when only global exists", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "plancop-home-test-"));
    const globalDir = join(fakeHome, ".plancop");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "config.json"),
      JSON.stringify({ autoApprove: ["read"], theme: "light" })
    );

    const config = loadConfig(tempDir, fakeHome);
    expect(config.autoApprove).toEqual(["read"]);
    expect(config.theme).toBe("light");
    expect(config.intercept).toEqual(DEFAULT_CONFIG.intercept);

    rmSync(fakeHome, { recursive: true, force: true });
  });
});

describe("shouldInterceptWithConfig", () => {
  const config: PlancopConfig = {
    intercept: ["edit", "create", "write"],
    ignore: ["read", "ls", "view"],
    autoApprove: ["bash"],
    theme: "dark",
  };

  it("returns 'intercept' for tools in intercept list", () => {
    expect(shouldInterceptWithConfig(config, "edit")).toBe("intercept");
    expect(shouldInterceptWithConfig(config, "create")).toBe("intercept");
    expect(shouldInterceptWithConfig(config, "write")).toBe("intercept");
  });

  it("returns 'auto-approve' for tools in autoApprove list", () => {
    expect(shouldInterceptWithConfig(config, "bash")).toBe("auto-approve");
  });

  it("returns 'pass-through' for tools in ignore list", () => {
    expect(shouldInterceptWithConfig(config, "read")).toBe("pass-through");
    expect(shouldInterceptWithConfig(config, "ls")).toBe("pass-through");
    expect(shouldInterceptWithConfig(config, "view")).toBe("pass-through");
  });

  it("returns 'pass-through' for unlisted tools", () => {
    expect(shouldInterceptWithConfig(config, "unknown_tool")).toBe("pass-through");
  });

  it("autoApprove takes priority over intercept", () => {
    const conflicting: PlancopConfig = {
      intercept: ["edit", "bash"],
      ignore: [],
      autoApprove: ["bash"],
      theme: "dark",
    };
    expect(shouldInterceptWithConfig(conflicting, "bash")).toBe("auto-approve");
  });

  it("ignore takes priority over intercept", () => {
    const conflicting: PlancopConfig = {
      intercept: ["edit", "read"],
      ignore: ["read"],
      autoApprove: [],
      theme: "dark",
    };
    expect(shouldInterceptWithConfig(conflicting, "read")).toBe("pass-through");
  });
});

describe("mergeConfigs", () => {
  it("override replaces base fields", () => {
    const merged = mergeConfigs(DEFAULT_CONFIG, {
      intercept: ["bash"],
      theme: "light",
    });
    expect(merged.intercept).toEqual(["bash"]);
    expect(merged.theme).toBe("light");
  });

  it("keeps base fields when override is empty", () => {
    const merged = mergeConfigs(DEFAULT_CONFIG, {});
    expect(merged).toEqual(DEFAULT_CONFIG);
  });

  it("does not mutate the base config", () => {
    const baseCopy = { ...DEFAULT_CONFIG, intercept: [...DEFAULT_CONFIG.intercept] };
    mergeConfigs(DEFAULT_CONFIG, { intercept: ["bash"] });
    expect(DEFAULT_CONFIG.intercept).toEqual(baseCopy.intercept);
  });
});
