import { describe, it, expect } from "vitest";
import { isValidExitPlanModeInput, isCopilotPreToolUseInput } from "../hook.js";

describe("isValidExitPlanModeInput", () => {
  it("accepts valid ExitPlanMode input", () => {
    expect(
      isValidExitPlanModeInput({
        tool_input: { plan: "# My Plan" },
        permission_mode: "default",
      })
    ).toBe(true);
  });

  it("accepts input without permission_mode", () => {
    expect(
      isValidExitPlanModeInput({ tool_input: { plan: "# Plan" } })
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidExitPlanModeInput(null)).toBe(false);
  });

  it("rejects missing tool_input", () => {
    expect(isValidExitPlanModeInput({ foo: "bar" })).toBe(false);
  });

  it("rejects missing plan field", () => {
    expect(isValidExitPlanModeInput({ tool_input: {} })).toBe(false);
  });

  it("rejects non-string plan", () => {
    expect(
      isValidExitPlanModeInput({ tool_input: { plan: 123 } })
    ).toBe(false);
  });
});

describe("isCopilotPreToolUseInput", () => {
  it("accepts valid Copilot preToolUse input", () => {
    expect(
      isCopilotPreToolUseInput({
        timestamp: 1704614600000,
        cwd: "/path/to/project",
        toolName: "exit_plan_mode",
        toolArgs: "{}",
      })
    ).toBe(true);
  });

  it("accepts minimal input with toolName and cwd", () => {
    expect(
      isCopilotPreToolUseInput({ toolName: "bash", cwd: "/tmp" })
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isCopilotPreToolUseInput(null)).toBe(false);
  });

  it("rejects missing toolName", () => {
    expect(isCopilotPreToolUseInput({ cwd: "/tmp" })).toBe(false);
  });

  it("rejects missing cwd", () => {
    expect(isCopilotPreToolUseInput({ toolName: "bash" })).toBe(false);
  });

  it("rejects non-string toolName", () => {
    expect(isCopilotPreToolUseInput({ toolName: 123, cwd: "/tmp" })).toBe(false);
  });
});
