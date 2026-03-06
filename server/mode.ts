/**
 * NOTE: This module is tested but NOT used at runtime by server/index.ts.
 * Runtime interception logic lives in scripts/plan-review.sh.
 * TODO: Consolidate — make server consume this module instead of duplicating logic in shell.
 */
export type PlancopMode = "off" | "auto" | "always" | "aggressive";

const VALID_MODES: ReadonlySet<string> = new Set([
  "off",
  "auto",
  "always",
  "aggressive",
]);

const AUTO_TOOLS: ReadonlySet<string> = new Set(["edit", "create", "write"]);
const AGGRESSIVE_TOOLS: ReadonlySet<string> = new Set([
  "edit",
  "create",
  "write",
  "bash",
]);

export function getMode(): PlancopMode {
  const mode = process.env.PLANCOP_MODE || "auto";
  if (VALID_MODES.has(mode)) {
    return mode as PlancopMode;
  }
  return "auto";
}

export function shouldIntercept(mode: PlancopMode, toolName: string): boolean {
  if (mode === "off") return false;
  if (mode === "always") return true;
  if (mode === "aggressive") return AGGRESSIVE_TOOLS.has(toolName);
  return AUTO_TOOLS.has(toolName);
}
