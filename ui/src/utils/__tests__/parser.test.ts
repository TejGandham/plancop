/**
 * Parser tests — markdown rendering pipeline verification (T12)
 *
 * Covers: code block language detection, mermaid blocks, tables,
 * blockquotes, frontmatter extraction, and the sample-plan fixture.
 */

import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseMarkdownToBlocks, extractFrontmatter, exportAnnotations, exportLinkedDocAnnotations } from "../parser";

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

describe("parseMarkdownToBlocks — list items", () => {
  test("parses unordered list items", () => {
    const md = "- Item 1\n- Item 2\n- Item 3";
    const blocks = parseMarkdownToBlocks(md);
    const listItems = blocks.filter((b) => b.type === "list-item");
    expect(listItems.length).toBe(3);
    expect(listItems[0].content).toBe("Item 1");
    expect(listItems[1].content).toBe("Item 2");
  });

  test("parses ordered list items", () => {
    const md = "1. First\n2. Second\n3. Third";
    const blocks = parseMarkdownToBlocks(md);
    const listItems = blocks.filter((b) => b.type === "list-item");
    expect(listItems.length).toBe(3);
    expect(listItems[0].content).toBe("First");
  });

  test("parses checkbox list items", () => {
    const md = "- [x] Done\n- [ ] Not done";
    const blocks = parseMarkdownToBlocks(md);
    const listItems = blocks.filter((b) => b.type === "list-item");
    expect(listItems[0].checked).toBe(true);
    expect(listItems[1].checked).toBe(false);
  });

  test("parses nested list items with indentation", () => {
    const md = "- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2";
    const blocks = parseMarkdownToBlocks(md);
    const listItems = blocks.filter((b) => b.type === "list-item");
    expect(listItems.length).toBeGreaterThanOrEqual(3);
    expect(listItems[1].level).toBeGreaterThan(listItems[0].level);
  });

  test("handles mixed list markers", () => {
    const md = "* Item 1\n- Item 2\n+ Item 3";
    const blocks = parseMarkdownToBlocks(md);
    const listItems = blocks.filter((b) => b.type === "list-item");
    expect(listItems.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseMarkdownToBlocks — headings", () => {
  test("parses heading levels", () => {
    const md = "# H1\n## H2\n### H3";
    const blocks = parseMarkdownToBlocks(md);
    const headings = blocks.filter((b) => b.type === "heading");
    expect(headings.length).toBe(3);
    expect(headings[0].level).toBe(1);
    expect(headings[1].level).toBe(2);
    expect(headings[2].level).toBe(3);
  });

  test("extracts heading content", () => {
    const md = "# My Title";
    const blocks = parseMarkdownToBlocks(md);
    const heading = blocks.find((b) => b.type === "heading");
    expect(heading?.content).toBe("My Title");
  });
});

describe("parseMarkdownToBlocks — horizontal rules", () => {
  test("parses --- as horizontal rule", () => {
    const md = "Text\n---\nMore text";
    const blocks = parseMarkdownToBlocks(md);
    const hr = blocks.find((b) => b.type === "hr");
    expect(hr).toBeDefined();
  });

  test("parses *** as horizontal rule", () => {
    const md = "Text\n***\nMore text";
    const blocks = parseMarkdownToBlocks(md);
    const hr = blocks.find((b) => b.type === "hr");
    expect(hr).toBeDefined();
  });
});

describe("parseMarkdownToBlocks — paragraphs", () => {
  test("parses simple paragraph", () => {
    const md = "This is a paragraph.";
    const blocks = parseMarkdownToBlocks(md);
    const para = blocks.find((b) => b.type === "paragraph");
    expect(para?.content).toBe("This is a paragraph.");
  });

  test("separates paragraphs by empty lines", () => {
    const md = "Para 1\n\nPara 2\n\nPara 3";
    const blocks = parseMarkdownToBlocks(md);
    const paras = blocks.filter((b) => b.type === "paragraph");
    expect(paras.length).toBe(3);
  });

  test("handles multi-line paragraphs", () => {
    const md = "Line 1\nLine 2\nLine 3";
    const blocks = parseMarkdownToBlocks(md);
    const para = blocks.find((b) => b.type === "paragraph");
    expect(para?.content).toContain("Line 1");
    expect(para?.content).toContain("Line 2");
  });
});

describe("parseMarkdownToBlocks — edge cases", () => {
  test("handles empty markdown", () => {
    const blocks = parseMarkdownToBlocks("");
    expect(blocks.length).toBe(0);
  });

  test("handles only whitespace", () => {
    const blocks = parseMarkdownToBlocks("   \n\n   ");
    expect(blocks.length).toBe(0);
  });

  test("all blocks have unique IDs", () => {
    const md = "# H1\n## H2\n- Item\n> Quote";
    const blocks = parseMarkdownToBlocks(md);
    const ids = blocks.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("blocks have correct order property", () => {
    const md = "# H1\n## H2\n- Item";
    const blocks = parseMarkdownToBlocks(md);
    blocks.forEach((b, i) => {
      expect(b.order).toBe(i + 1);
    });
  });
});

describe("extractFrontmatter — edge cases", () => {
  test("handles frontmatter with no closing delimiter", () => {
    const md = "---\ntitle: Test\nno closing";
    const { frontmatter, content } = extractFrontmatter(md);
    expect(frontmatter).toBeNull();
  });

  test("handles empty frontmatter", () => {
    const md = "---\n---\nContent";
    const { frontmatter, content } = extractFrontmatter(md);
    expect(frontmatter).not.toBeNull();
    expect(Object.keys(frontmatter || {}).length).toBe(0);
  });

  test("preserves content after frontmatter", () => {
    const md = "---\ntitle: Test\n---\n# Heading\nParagraph";
    const { frontmatter, content } = extractFrontmatter(md);
    expect(content).toContain("# Heading");
    expect(content).toContain("Paragraph");
  });
});

describe("exportLinkedDocAnnotations", () => {
  test("returns empty feedback for empty docAnnotations", () => {
    const docAnnotations = new Map();
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Linked Document Feedback");
  });

  test("skips documents with no annotations or attachments", () => {
    const docAnnotations = new Map([
      ["doc1.md", { annotations: [], globalAttachments: [] }],
      ["doc2.md", { annotations: [], globalAttachments: [] }],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Linked Document Feedback");
    expect(result).not.toContain("doc1.md");
  });

  test("includes document with annotations", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "COMMENT",
              originalText: "text",
              text: "feedback",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("doc1.md");
    expect(result).toContain("feedback");
  });

  test("includes global attachments in document feedback", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [],
          globalAttachments: [{ name: "ref.png", path: "/path/to/ref.png" }],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("doc1.md");
    expect(result).toContain("Reference Images");
    expect(result).toContain("ref.png");
  });

  test("exports DELETION annotation in linked doc", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "DELETION",
              originalText: "remove this",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Remove this");
    expect(result).toContain("remove this");
  });

  test("exports INSERTION annotation in linked doc", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "INSERTION",
              text: "add this",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Add this");
    expect(result).toContain("add this");
  });

  test("exports REPLACEMENT annotation in linked doc", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "REPLACEMENT",
              originalText: "old",
              text: "new",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Change this");
    expect(result).toContain("old");
    expect(result).toContain("new");
  });

  test("exports COMMENT annotation in linked doc", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "COMMENT",
              originalText: "text",
              text: "my comment",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Feedback on");
    expect(result).toContain("my comment");
  });

  test("exports GLOBAL_COMMENT annotation in linked doc", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "GLOBAL_COMMENT",
              text: "general feedback",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("General feedback about the document");
    expect(result).toContain("general feedback");
  });

  test("includes attached images in linked doc annotations", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "COMMENT",
              originalText: "text",
              text: "comment",
              startOffset: 0,
              images: [{ name: "screenshot.png", path: "/path/to/screenshot.png" }],
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("Attached images");
    expect(result).toContain("screenshot.png");
  });

  test("handles multiple documents with annotations", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-1",
              type: "COMMENT",
              originalText: "text1",
              text: "feedback1",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
      [
        "doc2.md",
        {
          annotations: [
            {
              blockId: "block-2",
              type: "COMMENT",
              originalText: "text2",
              text: "feedback2",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    expect(result).toContain("doc1.md");
    expect(result).toContain("doc2.md");
    expect(result).toContain("feedback1");
    expect(result).toContain("feedback2");
  });

  test("sorts annotations by blockId and offset", () => {
    const docAnnotations = new Map([
      [
        "doc1.md",
        {
          annotations: [
            {
              blockId: "block-2",
              type: "COMMENT",
              originalText: "text2",
              text: "feedback2",
              startOffset: 0,
            },
            {
              blockId: "block-1",
              type: "COMMENT",
              originalText: "text1",
              text: "feedback1",
              startOffset: 0,
            },
          ],
          globalAttachments: [],
        },
      ],
    ]);
    const result = exportLinkedDocAnnotations(docAnnotations);
    // Should be sorted by blockId
    const feedback1Index = result.indexOf("feedback1");
    const feedback2Index = result.indexOf("feedback2");
    expect(feedback1Index).toBeLessThan(feedback2Index);
  });
});
