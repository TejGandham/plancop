import { describe, expect, it, vi } from "vitest";
import * as enrichment from "../enrichment.js";

describe("enrichEditTool", () => {
  it("returns edit args with detected language", () => {
    const result = enrichment.enrichEditTool({
      file: "src/example.ts",
      old_string: "const a = 1",
      new_string: "const a = 2",
    });

    expect(result).toEqual({
      file: "src/example.ts",
      old_string: "const a = 1",
      new_string: "const a = 2",
      language: "typescript",
    });
  });
});

describe("enrichCreateTool", () => {
  it("returns create args with detected language", () => {
    const result = enrichment.enrichCreateTool({
      file: "scripts/tool.py",
      content: "print('hello')",
    });

    expect(result).toEqual({
      file: "scripts/tool.py",
      content: "print('hello')",
      language: "python",
    });
  });
});

describe("enrichPlanData", () => {
  it("calls enrichEditTool for edit toolName", () => {
    const spy = vi.spyOn(enrichment.TOOL_ENRICHERS, "edit");

    const result = enrichment.enrichPlanData({
      timestamp: 111,
      cwd: "/tmp/project",
      toolName: "edit",
      toolArgs: '{"file":"src/main.ts","old_string":"a","new_string":"b"}',
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(result.toolArgs).toEqual({
      file: "src/main.ts",
      old_string: "a",
      new_string: "b",
      language: "typescript",
    });

    spy.mockRestore();
  });

  it("calls enrichCreateTool for create toolName", () => {
    const spy = vi.spyOn(enrichment.TOOL_ENRICHERS, "create");

    const result = enrichment.enrichPlanData({
      timestamp: 222,
      cwd: "/tmp/project",
      toolName: "create",
      toolArgs: '{"file":"src/new.js","content":"console.log(1)"}',
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(result.toolArgs).toEqual({
      file: "src/new.js",
      content: "console.log(1)",
      language: "javascript",
    });

    spy.mockRestore();
  });

  it("returns error object for malformed toolArgs and does not crash", () => {
    const result = enrichment.enrichPlanData({
      timestamp: 333,
      cwd: "/tmp/project",
      toolName: "edit",
      toolArgs: "{not-json",
    });

    expect(result.toolArgs).toEqual({ _parseError: true, error: "Invalid toolArgs JSON" });
    expect(result.plan).toBe("");
    expect(result.toolName).toBe("edit");
  });

  it("enriches tool args that contain an 'error' field without treating it as parse error", () => {
    const result = enrichment.enrichPlanData({
      timestamp: 444,
      cwd: "/tmp/project",
      toolName: "create",
      toolArgs: '{"file":"src/err.ts","content":"handle error","error":"not a parse error"}',
    });

    expect(result.toolArgs).toMatchObject({
      file: "src/err.ts",
      content: "handle error",
      language: "typescript",
    });
    expect(result.plan).toBe("handle error");
  });
});

describe("detectLanguage", () => {
  it("maps known extensions", () => {
    expect(enrichment.detectLanguage("src/file.ts")).toBe("typescript");
    expect(enrichment.detectLanguage("scripts/file.py")).toBe("python");
    expect(enrichment.detectLanguage("web/file.js")).toBe("javascript");
  });
});
