/**
 * Hook types for plan review integration.
 *
 * Supports two agent CLIs:
 * - Claude Code: ExitPlanMode PermissionRequest hook
 *   Input:  { tool_input: { plan: "..." }, permission_mode?: "..." }
 *   Output: { hookSpecificOutput: { hookEventName, decision: { behavior, message? } } }
 * - Copilot CLI: preToolUse hook intercepting exit_plan_mode
 *   Input:  { toolName: "exit_plan_mode", toolArgs: "...", cwd: "...", timestamp: ... }
 *   Output: { permissionDecision: "allow"|"deny", permissionDecisionReason?: "..." }
 */

/** stdin JSON from Claude Code ExitPlanMode PermissionRequest hook */
export interface ExitPlanModeInput {
  tool_input: { plan: string };
  permission_mode?: string;
}

/** stdout JSON response for PermissionRequest hook */
export interface PermissionRequestOutput {
  hookSpecificOutput: {
    hookEventName: "PermissionRequest";
    decision:
      | { behavior: "allow" }
      | { behavior: "deny"; message: string };
  };
}

/** Type guard: validates that a value is a well-formed ExitPlanModeInput */
export function isValidExitPlanModeInput(value: unknown): value is ExitPlanModeInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const toolInput = v.tool_input;
  if (typeof toolInput !== "object" || toolInput === null) return false;
  const ti = toolInput as Record<string, unknown>;
  return typeof ti.plan === "string";
}

// --- Copilot CLI types ---

/** stdin JSON from Copilot CLI preToolUse hook */
export interface CopilotPreToolUseInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: string;
}

/** stdout JSON response for Copilot CLI preToolUse hook */
export interface CopilotPermissionOutput {
  permissionDecision: "allow" | "deny";
  permissionDecisionReason?: string;
}

/** Type guard: validates that a value is a Copilot CLI preToolUse event */
export function isCopilotPreToolUseInput(value: unknown): value is CopilotPreToolUseInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.toolName === "string" && typeof v.cwd === "string";
}
