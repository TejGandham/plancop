/**
 * stdin JSON from Copilot CLI preToolUse hook.
 * CRITICAL: toolArgs is a JSON STRING — must be parsed twice (double-parse).
 */
export interface PreToolUseInput {
  timestamp: number;  // Unix timestamp in milliseconds
  cwd: string;        // Absolute path to working directory
  toolName: string;   // 'edit' | 'create' | 'write' | 'bash' | 'read' | 'ls' | etc.
  toolArgs: string;   // JSON-encoded string — MUST JSON.parse() again to get actual args
}

/** Parsed toolArgs for Copilot CLI 'edit' tool */
export interface EditToolArgs {
  file: string;
  old_string: string;
  new_string: string;
}

/** Parsed toolArgs for Copilot CLI 'create' tool */
export interface CreateToolArgs {
  file: string;
  content: string;
}

/** Parsed toolArgs for Copilot CLI 'bash' tool */
export interface BashToolArgs {
  command: string;
  description?: string;
}

/**
 * stdout JSON response to Copilot CLI preToolUse hook.
 * NOTE: Only 'deny' is currently processed. 'allow' is accepted but has no distinct effect.
 * To allow: either output {"permissionDecision":"allow"} or exit 0 with no stdout.
 */
export interface HookDecision {
  permissionDecision: 'allow' | 'deny';
  permissionDecisionReason?: string;  // Required and surfaced to user when denying
}

/** Type guard: validates that a value is a well-formed PreToolUseInput */
export function isValidPreToolUseInput(value: unknown): value is PreToolUseInput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.timestamp === 'number' &&
    typeof v.cwd === 'string' &&
    typeof v.toolName === 'string' &&
    typeof v.toolArgs === 'string'
  );
}
