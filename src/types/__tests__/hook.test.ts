import { describe, it, expect } from "vitest";
import { isValidExitPlanModeInput } from "../hook.js";

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
