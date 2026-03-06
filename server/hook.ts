import type {
  CreateToolArgs,
  EditToolArgs,
  HookDecision,
  PreToolUseInput,
} from "../src/types/hook.ts";
import { isValidPreToolUseInput } from "../src/types/hook.ts";
import type { PlanData } from "../src/types/plan.ts";

const INVALID_INPUT_JSON_ERROR = "Invalid preToolUse input JSON";
const INVALID_INPUT_SHAPE_ERROR = "Invalid preToolUse input shape";
const INVALID_TOOL_ARGS_ERROR = "Invalid toolArgs JSON";

export interface ToolArgsParseError {
  _parseError: true;
  error: string;
}

export function parsePreToolUseInput(raw: string): PreToolUseInput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(INVALID_INPUT_JSON_ERROR);
  }

  if (!isValidPreToolUseInput(parsed)) {
    throw new Error(INVALID_INPUT_SHAPE_ERROR);
  }

  return parsed;
}

export function parseToolArgs(
  toolArgsStr: string
): EditToolArgs | CreateToolArgs | Record<string, unknown> | ToolArgsParseError {
  try {
    const parsed: unknown = JSON.parse(toolArgsStr);

    if (typeof parsed !== "object" || parsed === null) {
      return { _parseError: true, error: INVALID_TOOL_ARGS_ERROR };
    }

    return parsed as EditToolArgs | CreateToolArgs | Record<string, unknown>;
  } catch {
    return { _parseError: true, error: INVALID_TOOL_ARGS_ERROR };
  }
}

export function buildPlanData(input: PreToolUseInput): PlanData {
  return {
    plan: "",
    toolName: input.toolName,
    toolArgs: parseToolArgs(input.toolArgs),
    cwd: input.cwd,
    timestamp: input.timestamp,
  };
}

export function getDecisionJSON(
  decision: HookDecision["permissionDecision"],
  reason?: string
): string {
  const payload: HookDecision =
    decision === "deny" && reason
      ? { permissionDecision: "deny", permissionDecisionReason: reason }
      : { permissionDecision: decision };

  return JSON.stringify(payload);
}
