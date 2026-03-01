import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface PlancopConfig {
  intercept: string[];
  ignore: string[];
  autoApprove: string[];
  theme: "dark" | "light";
}

export const DEFAULT_CONFIG: PlancopConfig = {
  intercept: ["edit", "create", "write"],
  ignore: ["read", "ls", "view"],
  autoApprove: [],
  theme: "dark",
};

function readConfigFile(filePath: string): Partial<PlancopConfig> | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      process.stderr.write(`plancop: invalid config at ${filePath}\n`);
      return null;
    }

    return parsed as Partial<PlancopConfig>;
  } catch {
    process.stderr.write(`plancop: invalid config at ${filePath}\n`);
    return null;
  }
}

export function mergeConfigs(
  base: PlancopConfig,
  override: Partial<PlancopConfig>
): PlancopConfig {
  return {
    intercept: override.intercept ?? base.intercept,
    ignore: override.ignore ?? base.ignore,
    autoApprove: override.autoApprove ?? base.autoApprove,
    theme: override.theme ?? base.theme,
  };
}

export function loadConfig(
  cwd: string,
  home: string = homedir()
): PlancopConfig {
  const globalPath = join(home, ".plancop", "config.json");
  const projectPath = join(cwd, ".plancop", "config.json");

  const globalOverride = readConfigFile(globalPath);
  const projectOverride = readConfigFile(projectPath);

  let config = { ...DEFAULT_CONFIG };

  if (globalOverride) {
    config = mergeConfigs(config, globalOverride);
  }

  if (projectOverride) {
    config = mergeConfigs(config, projectOverride);
  }

  return config;
}

export function shouldInterceptWithConfig(
  config: PlancopConfig,
  toolName: string
): "intercept" | "auto-approve" | "pass-through" {
  if (config.autoApprove.includes(toolName)) return "auto-approve";
  if (config.ignore.includes(toolName)) return "pass-through";
  if (config.intercept.includes(toolName)) return "intercept";
  return "pass-through";
}
