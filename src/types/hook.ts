/**
 * ExitPlanMode hook types for Claude Code PermissionRequest.
 *
 * Input (stdin):  { tool_input: { plan: "..." }, permission_mode?: "..." }
 * Output (stdout): { hookSpecificOutput: { hookEventName, decision: { behavior, message? } } }
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
