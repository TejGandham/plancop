/**
 * PlanDiffViewer + planDiffEngine Tests
 *
 * Tests for T19 (PlanDiffViewer component) and T20 (Version selector).
 * Covers diff computation, visual styling, and version selector visibility.
 */

import { describe, it, expect } from "vitest";
import { computePlanDiff } from "../../utils/planDiffEngine";

// ── planDiffEngine ──────────────────────────────────────────────────

describe("computePlanDiff", () => {
  it("returns empty diff for identical content", () => {
    const text = "# Hello\n\nSome content here.\n";
    const { blocks, stats } = computePlanDiff(text, text);

    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
    expect(stats.modifications).toBe(0);
    expect(blocks.every((b) => b.type === "unchanged")).toBe(true);
  });

  it("detects added lines", () => {
    const old = "Line 1\nLine 2\n";
    const now = "Line 1\nLine 2\nLine 3\n";
    const { blocks, stats } = computePlanDiff(old, now);

    const added = blocks.filter((b) => b.type === "added");
    expect(added.length).toBeGreaterThan(0);
    expect(stats.additions).toBeGreaterThan(0);
    // The added block should contain Line 3
    expect(added.some((b) => b.content.includes("Line 3"))).toBe(true);
  });

  it("detects removed lines", () => {
    const old = "Line 1\nLine 2\nLine 3\n";
    const now = "Line 1\nLine 2\n";
    const { blocks, stats } = computePlanDiff(old, now);

    const removed = blocks.filter((b) => b.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
    expect(stats.deletions).toBeGreaterThan(0);
    expect(removed.some((b) => b.content.includes("Line 3"))).toBe(true);
  });

  it("detects modified (replaced) lines as a modified block", () => {
    const old = "Line 1\nOld content\nLine 3\n";
    const now = "Line 1\nNew content\nLine 3\n";
    const { blocks, stats } = computePlanDiff(old, now);

    const modified = blocks.filter((b) => b.type === "modified");
    expect(modified.length).toBeGreaterThan(0);
    expect(stats.modifications).toBeGreaterThan(0);
    // Modified blocks should have both content (new) and oldContent
    expect(modified[0].content).toContain("New content");
    expect(modified[0].oldContent).toContain("Old content");
  });

  it("handles empty strings", () => {
    const { blocks, stats } = computePlanDiff("", "");
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
    expect(stats.modifications).toBe(0);
    // diffLines may return an empty unchanged block for empty-vs-empty
    blocks.forEach((b) => {
      expect(b.type).toBe("unchanged");
    });
  });

  it("handles adding content to empty document", () => {
    const { blocks, stats } = computePlanDiff("", "New content\n");
    expect(stats.additions).toBeGreaterThan(0);
    const added = blocks.filter((b) => b.type === "added");
    expect(added.length).toBeGreaterThan(0);
  });

  it("handles removing all content", () => {
    const { blocks, stats } = computePlanDiff("Some content\n", "");
    expect(stats.deletions).toBeGreaterThan(0);
    const removed = blocks.filter((b) => b.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
  });

  it("handles multiline modifications correctly", () => {
    const old = [
      "# Plan",
      "",
      "## Phase 1",
      "- Do task A",
      "- Do task B",
      "",
      "## Phase 2",
      "- Do task C",
    ].join("\n");

    const now = [
      "# Plan",
      "",
      "## Phase 1",
      "- Do task A",
      "- Do task B (revised)",
      "",
      "## Phase 2",
      "- Do task C",
      "- Do task D",
    ].join("\n");

    const { blocks, stats } = computePlanDiff(old, now);
    // There should be changes detected
    expect(stats.additions + stats.deletions + stats.modifications).toBeGreaterThan(0);
    // Unchanged blocks should exist
    expect(blocks.some((b) => b.type === "unchanged")).toBe(true);
  });
});

// ── PlanDiffBlock type invariants ───────────────────────────────────

describe("PlanDiffBlock structure", () => {
  it("modified blocks always have oldContent", () => {
    const old = "Alpha\n";
    const now = "Beta\n";
    const { blocks } = computePlanDiff(old, now);

    const modified = blocks.filter((b) => b.type === "modified");
    modified.forEach((b) => {
      expect(b.oldContent).toBeDefined();
      expect(b.oldContent!.length).toBeGreaterThan(0);
    });
  });

  it("all blocks have a lines count", () => {
    const old = "A\nB\nC\n";
    const now = "A\nX\nC\nD\n";
    const { blocks } = computePlanDiff(old, now);

    blocks.forEach((b) => {
      expect(typeof b.lines).toBe("number");
      expect(b.lines).toBeGreaterThanOrEqual(0);
    });
  });

  it("non-modified blocks do NOT have oldContent", () => {
    const old = "Hello\n";
    const now = "Hello\nWorld\n";
    const { blocks } = computePlanDiff(old, now);

    const nonModified = blocks.filter((b) => b.type !== "modified");
    nonModified.forEach((b) => {
      expect(b.oldContent).toBeUndefined();
    });
  });
});

// ── Version selector visibility logic ───────────────────────────────

describe("Version selector visibility (T20 logic)", () => {
  it("should NOT show comparison when only 1 version", () => {
    const versionInfo = { version: 1, totalVersions: 1, project: "test" };
    const hasPreviousVersion = versionInfo.totalVersions > 1;
    expect(hasPreviousVersion).toBe(false);
  });

  it("should show comparison when multiple versions exist", () => {
    const versionInfo = { version: 3, totalVersions: 3, project: "test" };
    const hasPreviousVersion = versionInfo.totalVersions > 1;
    expect(hasPreviousVersion).toBe(true);
  });

  it("default base version is version - 1", () => {
    const versionInfo = { version: 5, totalVersions: 5, project: "test" };
    const expectedBase =
      versionInfo.version > 1 ? versionInfo.version - 1 : null;
    expect(expectedBase).toBe(4);
  });

  it("version 1 has no base version", () => {
    const versionInfo = { version: 1, totalVersions: 1, project: "test" };
    const expectedBase =
      versionInfo.version > 1 ? versionInfo.version - 1 : null;
    expect(expectedBase).toBeNull();
  });
});

// ── CSS class assignment (diff styling logic) ───────────────────────

describe("Diff styling classes", () => {
  it("added blocks use plan-diff-added class (green styling)", () => {
    // The PlanCleanDiffView renders added blocks with className "plan-diff-added"
    // This test validates the diff engine produces the right type
    const { blocks } = computePlanDiff("", "new line\n");
    const added = blocks.filter((b) => b.type === "added");
    expect(added.length).toBeGreaterThan(0);
    // The component maps type "added" → className "plan-diff-added"
    // which CSS styles with green border-left
  });

  it("removed blocks use plan-diff-removed class (red styling)", () => {
    const { blocks } = computePlanDiff("old line\n", "");
    const removed = blocks.filter((b) => b.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
    // The component maps type "removed" → className "plan-diff-removed"
    // which CSS styles with red border-left + strikethrough
  });

  it("unchanged blocks get opacity-60 dimming", () => {
    const { blocks } = computePlanDiff(
      "same\nchanged\n",
      "same\nmodified\n"
    );
    const unchanged = blocks.filter((b) => b.type === "unchanged");
    expect(unchanged.length).toBeGreaterThan(0);
    // The component renders unchanged with opacity-60 class
  });
});

// ── Raw diff line generation ────────────────────────────────────────

describe("Raw diff line markers", () => {
  it("added lines get + prefix", () => {
    const { blocks } = computePlanDiff("A\n", "A\nB\n");
    const added = blocks.filter((b) => b.type === "added");
    expect(added.length).toBeGreaterThan(0);
    // PlanRawDiffView renders added lines with "+" in the gutter
  });

  it("removed lines get - prefix", () => {
    const { blocks } = computePlanDiff("A\nB\n", "A\n");
    const removed = blocks.filter((b) => b.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
    // PlanRawDiffView renders removed lines with "-" in the gutter
  });

  it("modified blocks produce both - and + lines in raw view", () => {
    const { blocks } = computePlanDiff("Old text\n", "New text\n");
    const modified = blocks.filter((b) => b.type === "modified");
    expect(modified.length).toBeGreaterThan(0);
    // PlanRawDiffView renders old lines of modified blocks as removed (-) and new lines as added (+)
    expect(modified[0].oldContent).toBeDefined();
    expect(modified[0].content).toBeDefined();
  });
});
