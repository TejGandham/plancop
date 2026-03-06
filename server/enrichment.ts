import { extname } from "node:path";
import { parseToolArgs, type ToolArgsParseError } from "./hook.ts";
import type { CreateToolArgs, EditToolArgs, PreToolUseInput } from "../src/types/hook.ts";

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".json": "json",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
  ".sh": "bash",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sql": "sql",
};

type EnrichedEditToolArgs = EditToolArgs & { language: string };
type EnrichedCreateToolArgs = CreateToolArgs & { language: string };
type ParsedToolArgs = EditToolArgs | CreateToolArgs | Record<string, unknown> | ToolArgsParseError;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEditToolArgs(value: unknown): value is EditToolArgs {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    typeof value.old_string === "string" &&
    typeof value.new_string === "string"
  );
}

function isCreateToolArgs(value: unknown): value is CreateToolArgs {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    typeof value.content === "string"
  );
}

function hasParseError(value: ParsedToolArgs): value is ToolArgsParseError {
  return "_parseError" in value && (value as ToolArgsParseError)._parseError === true;
}

function getPlanContent(toolName: string, toolArgs: ParsedToolArgs): string {
  if (hasParseError(toolArgs)) {
    return "";
  }

  if (toolName === "edit" && typeof toolArgs.new_string === "string") {
    return toolArgs.new_string;
  }

  if (toolName === "create" && typeof toolArgs.content === "string") {
    return toolArgs.content;
  }

  if (typeof toolArgs.plan === "string") {
    return toolArgs.plan;
  }

  return "";
}

export function detectLanguage(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  return EXTENSION_MAP[extension] ?? "text";
}

export function enrichEditTool(args: EditToolArgs): EnrichedEditToolArgs {
  return {
    file: args.file,
    old_string: args.old_string,
    new_string: args.new_string,
    language: detectLanguage(args.file),
  };
}

export function enrichCreateTool(args: CreateToolArgs): EnrichedCreateToolArgs {
  return {
    file: args.file,
    content: args.content,
    language: detectLanguage(args.file),
  };
}

export const TOOL_ENRICHERS = {
  edit: enrichEditTool,
  create: enrichCreateTool,
};

export function enrichPlanData(input: PreToolUseInput): {
  plan: string;
  toolName: string;
  toolArgs: EnrichedEditToolArgs | EnrichedCreateToolArgs | Record<string, unknown> | ToolArgsParseError;
  cwd: string;
  timestamp: number;
} {
  const parsedToolArgs = parseToolArgs(input.toolArgs);
  let enrichedToolArgs: EnrichedEditToolArgs | EnrichedCreateToolArgs | Record<string, unknown> | ToolArgsParseError =
    parsedToolArgs;

  if (!hasParseError(parsedToolArgs)) {
    if (input.toolName === "edit" && isEditToolArgs(parsedToolArgs)) {
      enrichedToolArgs = TOOL_ENRICHERS.edit(parsedToolArgs);
    } else if (input.toolName === "create" && isCreateToolArgs(parsedToolArgs)) {
      enrichedToolArgs = TOOL_ENRICHERS.create(parsedToolArgs);
    }
  }

  return {
    plan: getPlanContent(input.toolName, enrichedToolArgs),
    toolName: input.toolName,
    toolArgs: enrichedToolArgs,
    cwd: input.cwd,
    timestamp: input.timestamp,
  };
}
