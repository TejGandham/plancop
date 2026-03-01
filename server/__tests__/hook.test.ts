import { describe, expect, it } from "vitest";
import {
  buildPlanData,
  getDecisionJSON,
  parsePreToolUseInput,
  parseToolArgs,
} from "../hook.js";

describe("parsePreToolUseInput", () => {
  it("parses and validates a valid preToolUse JSON payload", () => {
    const raw = JSON.stringify({
      timestamp: 1704614600000,
      cwd: "/home/developer/source/plancop",
      toolName: "edit",
      toolArgs: '{"file":"src/app.ts","old_string":"foo","new_string":"bar"}',
    });

    const parsed = parsePreToolUseInput(raw);

    expect(parsed.toolName).toBe("edit");
    expect(typeof parsed.toolArgs).toBe("string");
  });

  it("throws for malformed outer JSON", () => {
    expect(() => parsePreToolUseInput("not valid json")).toThrow(
      "Invalid preToolUse input JSON"
    );
  });

  it("throws for invalid payload shape", () => {
    const raw = JSON.stringify({
      timestamp: 1704614600000,
      cwd: "/home/developer/source/plancop",
      toolName: "edit",
      toolArgs: { file: "src/app.ts" },
    });

    expect(() => parsePreToolUseInput(raw)).toThrow(
      "Invalid preToolUse input shape"
    );
  });
});

describe("parseToolArgs", () => {
  it("double-parses edit tool args from JSON string", () => {
    const toolArgs = parseToolArgs(
      '{"file":"src/app.ts","old_string":"foo","new_string":"bar"}'
    );

    if ("error" in toolArgs) {
      throw new Error(`Expected parsed args, got error: ${toolArgs.error}`);
    }

    expect(toolArgs).toEqual({
      file: "src/app.ts",
      old_string: "foo",
      new_string: "bar",
    });
  });

  it("parses create tool args from JSON string", () => {
    const toolArgs = parseToolArgs('{"file":"src/new.ts","content":"hello"}');

    if ("error" in toolArgs) {
      throw new Error(`Expected parsed args, got error: ${toolArgs.error}`);
    }

    expect(toolArgs).toEqual({ file: "src/new.ts", content: "hello" });
  });

  it("returns error object for malformed inner JSON", () => {
    const toolArgs = parseToolArgs("not valid json");

    expect(toolArgs).toEqual({ error: "Invalid toolArgs JSON" });
  });
});

describe("buildPlanData", () => {
  it("constructs PlanData and parses toolArgs string into object", () => {
    const input = {
      timestamp: 1704614600000,
      cwd: "/home/developer/source/plancop",
      toolName: "edit",
      toolArgs: '{"file":"src/app.ts","old_string":"foo","new_string":"bar"}',
    };

    const planData = buildPlanData(input);

    expect(planData).toEqual({
      plan: "",
      toolName: "edit",
      toolArgs: {
        file: "src/app.ts",
        old_string: "foo",
        new_string: "bar",
      },
      cwd: "/home/developer/source/plancop",
      timestamp: 1704614600000,
    });
  });

  it("returns PlanData with graceful error object for malformed toolArgs", () => {
    const input = {
      timestamp: 1704614600000,
      cwd: "/home/developer/source/plancop",
      toolName: "edit",
      toolArgs: "not valid json",
    };

    const planData = buildPlanData(input);

    expect(planData.toolArgs).toEqual({ error: "Invalid toolArgs JSON" });
  });
});

describe("getDecisionJSON", () => {
  it("formats allow decision JSON", () => {
    expect(getDecisionJSON("allow")).toBe('{"permissionDecision":"allow"}');
  });

  it("formats deny decision JSON with reason", () => {
    expect(getDecisionJSON("deny", "reason")).toBe(
      '{"permissionDecision":"deny","permissionDecisionReason":"reason"}'
    );
  });
});
