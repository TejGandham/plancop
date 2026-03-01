/**
 * Parser tests — markdown rendering pipeline verification (T12)
 *
 * Covers: code block language detection, mermaid blocks, tables,
 * blockquotes, frontmatter extraction, and the sample-plan fixture.
 */

import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseMarkdownToBlocks, extractFrontmatter } from "../parser";

const samplePlan = readFileSync(
  resolve(__dirname, "../../../../test/fixtures/sample-plan.md"),
  "utf-8"
);

describe("parseMarkdownToBlocks — code blocks", () => {
  test("detects language on fenced code blocks", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const blocks = parseMarkdownToBlocks(md);
    const code = blocks.find((b) => b.type === "code");
    expect(code).toBeDefined();
    expect(code!.language).toBe("typescript");
    expect(code!.content).toBe("const x = 1;");
  });

  test("handles code block without language", () => {
    const md = "```\nplain text\n```";
    const blocks = parseMarkdownToBlocks(md);
    const code = blocks.find((b) => b.type === "code");
    expect(code).toBeDefined();
    expect(code!.language).toBeUndefined();
    expect(code!.content).toBe("plain text");
  });

  test("handles multi-line code block", () => {
    const md = "```rust\nfn main() {\n    println!(\"hello\");\n}\n```";
    const blocks = parseMarkdownToBlocks(md);
    const code = blocks.find((b) => b.type === "code");
    expect(code).toBeDefined();
    expect(code!.language).toBe("rust");
    expect(code!.content).toContain("fn main()");
    expect(code!.content).toContain('println!("hello")');
  });
});

describe("parseMarkdownToBlocks — mermaid blocks", () => {
  test("detects mermaid code blocks with correct language", () => {
    const md = "```mermaid\nflowchart TD\n    A-->B\n```";
    const blocks = parseMarkdownToBlocks(md);
    const mermaidBlock = blocks.find(
      (b) => b.type === "code" && b.language === "mermaid"
    );
    expect(mermaidBlock).toBeDefined();
    expect(mermaidBlock!.content).toContain("flowchart TD");
    expect(mermaidBlock!.content).toContain("A-->B");
  });

  test("mermaid block from sample-plan fixture", () => {
    const blocks = parseMarkdownToBlocks(samplePlan);
    const mermaidBlock = blocks.find(
      (b) => b.type === "code" && b.language === "mermaid"
    );
    expect(mermaidBlock).toBeDefined();
    expect(mermaidBlock!.content).toContain("flowchart TD");
    expect(mermaidBlock!.content).toContain("Session Auth");
  });
});

describe("parseMarkdownToBlocks — tables", () => {
  test("parses table blocks", () => {
    const md =
      "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |";
    const blocks = parseMarkdownToBlocks(md);
    const table = blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    expect(table!.content).toContain("| A | B |");
  });

  test("sample-plan fixture contains a table", () => {
    const blocks = parseMarkdownToBlocks(samplePlan);
    const table = blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    expect(table!.content).toContain("Criterion");
    expect(table!.content).toContain("JWT sign/verify");
  });
});

describe("parseMarkdownToBlocks — blockquotes", () => {
  test("parses blockquote blocks", () => {
    const md = "> This is a quote";
    const blocks = parseMarkdownToBlocks(md);
    const bq = blocks.find((b) => b.type === "blockquote");
    expect(bq).toBeDefined();
    expect(bq!.content).toBe("This is a quote");
  });

  test("sample-plan fixture contains blockquotes", () => {
    const blocks = parseMarkdownToBlocks(samplePlan);
    const bqs = blocks.filter((b) => b.type === "blockquote");
    expect(bqs.length).toBeGreaterThan(0);
    expect(bqs[0].content).toContain("Low Risk");
  });
});

describe("parseMarkdownToBlocks — sample-plan full parse", () => {
  test("produces correct block type distribution", () => {
    const blocks = parseMarkdownToBlocks(samplePlan);
    const types = blocks.map((b) => b.type);

    expect(types.filter((t) => t === "heading").length).toBeGreaterThanOrEqual(5);
    expect(types.filter((t) => t === "code").length).toBeGreaterThanOrEqual(3); // 2 TS + 1 mermaid
    expect(types.filter((t) => t === "table").length).toBe(1);
    expect(types.filter((t) => t === "blockquote").length).toBeGreaterThanOrEqual(1);
    expect(types.filter((t) => t === "list-item").length).toBeGreaterThanOrEqual(3);
  });

  test("all blocks have IDs and startLine", () => {
    const blocks = parseMarkdownToBlocks(samplePlan);
    blocks.forEach((b) => {
      expect(b.id).toBeTruthy();
      expect(b.startLine).toBeGreaterThan(0);
    });
  });
});

describe("extractFrontmatter", () => {
  test("returns null for content without frontmatter", () => {
    const { frontmatter, content } = extractFrontmatter("# Hello");
    expect(frontmatter).toBeNull();
    expect(content).toBe("# Hello");
  });

  test("parses simple YAML frontmatter", () => {
    const md = "---\ntitle: My Plan\nauthor: Alice\n---\n# Hello";
    const { frontmatter, content } = extractFrontmatter(md);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter!.title).toBe("My Plan");
    expect(frontmatter!.author).toBe("Alice");
    expect(content).toContain("# Hello");
  });

  test("parses array values in frontmatter", () => {
    const md = "---\ntags:\n- alpha\n- beta\n---\ncontent";
    const { frontmatter } = extractFrontmatter(md);
    expect(frontmatter).not.toBeNull();
    expect(Array.isArray(frontmatter!.tags)).toBe(true);
    expect(frontmatter!.tags).toEqual(["alpha", "beta"]);
  });
});
