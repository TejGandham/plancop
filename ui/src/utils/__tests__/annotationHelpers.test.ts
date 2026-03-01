import { describe, it, expect } from 'vitest';
import { AnnotationType } from '../../types';
import type { Annotation, Block } from '../../types';
import { getAnnotationCountBySection, buildTocHierarchy } from '../annotationHelpers';
import { exportAnnotations } from '../parser';
import { formatFeedback } from '../feedback';

// ─── Test Helpers ──────────────────────────────────────────────────

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'blk-1',
    type: 'paragraph',
    content: 'Some content',
    order: 0,
    startLine: 1,
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: `ann-${Math.random().toString(36).slice(2, 8)}`,
    blockId: 'blk-1',
    startOffset: 0,
    endOffset: 10,
    type: AnnotationType.COMMENT,
    originalText: 'selected text',
    createdA: Date.now(),
    ...overrides,
  };
}

// ─── Annotation Type System ────────────────────────────────────────

describe('AnnotationType enum', () => {
  it('has all 5 annotation types', () => {
    expect(AnnotationType.DELETION).toBe('DELETION');
    expect(AnnotationType.INSERTION).toBe('INSERTION');
    expect(AnnotationType.REPLACEMENT).toBe('REPLACEMENT');
    expect(AnnotationType.COMMENT).toBe('COMMENT');
    expect(AnnotationType.GLOBAL_COMMENT).toBe('GLOBAL_COMMENT');
  });

  it('has exactly 5 members', () => {
    const values = Object.values(AnnotationType);
    expect(values).toHaveLength(5);
  });
});

// ─── Create Annotation (factory) ───────────────────────────────────

describe('createAnnotation (factory)', () => {
  it('creates a DELETION annotation', () => {
    const ann = makeAnnotation({
      type: AnnotationType.DELETION,
      originalText: 'remove this',
    });
    expect(ann.type).toBe(AnnotationType.DELETION);
    expect(ann.originalText).toBe('remove this');
    expect(ann.text).toBeUndefined();
  });

  it('creates an INSERTION annotation with text', () => {
    const ann = makeAnnotation({
      type: AnnotationType.INSERTION,
      text: 'add this new content',
      originalText: '',
    });
    expect(ann.type).toBe(AnnotationType.INSERTION);
    expect(ann.text).toBe('add this new content');
  });

  it('creates a REPLACEMENT annotation with original and replacement text', () => {
    const ann = makeAnnotation({
      type: AnnotationType.REPLACEMENT,
      originalText: 'old text',
      text: 'new text',
    });
    expect(ann.type).toBe(AnnotationType.REPLACEMENT);
    expect(ann.originalText).toBe('old text');
    expect(ann.text).toBe('new text');
  });

  it('creates a COMMENT annotation with comment text', () => {
    const ann = makeAnnotation({
      type: AnnotationType.COMMENT,
      originalText: 'This section',
      text: 'Needs more detail',
    });
    expect(ann.type).toBe(AnnotationType.COMMENT);
    expect(ann.text).toBe('Needs more detail');
  });

  it('creates a GLOBAL_COMMENT annotation without blockId', () => {
    const ann = makeAnnotation({
      type: AnnotationType.GLOBAL_COMMENT,
      blockId: '',
      startOffset: 0,
      endOffset: 0,
      originalText: '',
      text: 'Overall the plan looks good',
    });
    expect(ann.type).toBe(AnnotationType.GLOBAL_COMMENT);
    expect(ann.blockId).toBe('');
    expect(ann.text).toBe('Overall the plan looks good');
  });

  it('includes author and timestamp', () => {
    const now = Date.now();
    const ann = makeAnnotation({ author: 'tater-xyz', createdA: now });
    expect(ann.author).toBe('tater-xyz');
    expect(ann.createdA).toBe(now);
  });

  it('supports image attachments', () => {
    const ann = makeAnnotation({
      images: [{ path: '/tmp/screenshot.png', name: 'screenshot.png' }],
    });
    expect(ann.images).toHaveLength(1);
    expect(ann.images![0].name).toBe('screenshot.png');
  });
});

// ─── Delete Annotation ─────────────────────────────────────────────

describe('deleteAnnotation (array filter)', () => {
  it('removes an annotation by id', () => {
    const annotations = [
      makeAnnotation({ id: 'ann-1' }),
      makeAnnotation({ id: 'ann-2' }),
      makeAnnotation({ id: 'ann-3' }),
    ];
    const result = annotations.filter(a => a.id !== 'ann-2');
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toEqual(['ann-1', 'ann-3']);
  });

  it('returns same array when id not found', () => {
    const annotations = [makeAnnotation({ id: 'ann-1' })];
    const result = annotations.filter(a => a.id !== 'nonexistent');
    expect(result).toHaveLength(1);
  });

  it('handles empty array', () => {
    const result: Annotation[] = [];
    expect(result.filter(a => a.id !== 'any')).toHaveLength(0);
  });
});

// ─── Export Annotations ────────────────────────────────────────────

describe('exportAnnotations', () => {
  const blocks: Block[] = [
    makeBlock({ id: 'blk-1', type: 'heading', level: 1, content: '# Title', order: 0, startLine: 1 }),
    makeBlock({ id: 'blk-2', type: 'paragraph', content: 'Some text', order: 1, startLine: 2 }),
  ];

  it('returns "No changes detected." for empty annotations', () => {
    expect(exportAnnotations(blocks, [])).toBe('No changes detected.');
  });

  it('formats DELETION annotation', () => {
    const anns = [makeAnnotation({ type: AnnotationType.DELETION, blockId: 'blk-2', originalText: 'remove me' })];
    const output = exportAnnotations(blocks, anns);
    expect(output).toContain('Remove this');
    expect(output).toContain('remove me');
  });

  it('formats INSERTION annotation', () => {
    const anns = [makeAnnotation({ type: AnnotationType.INSERTION, blockId: 'blk-2', text: 'new stuff' })];
    const output = exportAnnotations(blocks, anns);
    expect(output).toContain('Add this');
    expect(output).toContain('new stuff');
  });

  it('formats REPLACEMENT annotation', () => {
    const anns = [makeAnnotation({
      type: AnnotationType.REPLACEMENT,
      blockId: 'blk-2',
      originalText: 'old text',
      text: 'new text',
    })];
    const output = exportAnnotations(blocks, anns);
    expect(output).toContain('Change this');
    expect(output).toContain('old text');
    expect(output).toContain('new text');
  });

  it('formats COMMENT annotation', () => {
    const anns = [makeAnnotation({
      type: AnnotationType.COMMENT,
      blockId: 'blk-2',
      originalText: 'this section',
      text: 'needs work',
    })];
    const output = exportAnnotations(blocks, anns);
    expect(output).toContain('Feedback on');
    expect(output).toContain('needs work');
  });

  it('formats GLOBAL_COMMENT annotation', () => {
    const anns = [makeAnnotation({
      type: AnnotationType.GLOBAL_COMMENT,
      blockId: '',
      originalText: '',
      text: 'Overall good plan',
    })];
    const output = exportAnnotations(blocks, anns);
    expect(output).toContain('General feedback');
    expect(output).toContain('Overall good plan');
  });

  it('includes attached images in export', () => {
    const anns = [makeAnnotation({
      type: AnnotationType.COMMENT,
      blockId: 'blk-2',
      text: 'see screenshot',
      images: [{ path: '/tmp/img.png', name: 'img.png' }],
    })];
    const output = exportAnnotations(blocks, anns);
    expect(output).toContain('img.png');
    expect(output).toContain('/tmp/img.png');
  });
});

// ─── getAnnotationCountBySection ───────────────────────────────────

describe('getAnnotationCountBySection', () => {
  const blocks: Block[] = [
    makeBlock({ id: 'h1', type: 'heading', level: 1, content: 'Intro', order: 0, startLine: 1 }),
    makeBlock({ id: 'p1', type: 'paragraph', content: 'text', order: 1, startLine: 2 }),
    makeBlock({ id: 'h2', type: 'heading', level: 2, content: 'Details', order: 2, startLine: 5 }),
    makeBlock({ id: 'p2', type: 'paragraph', content: 'more text', order: 3, startLine: 6 }),
    makeBlock({ id: 'h1b', type: 'heading', level: 1, content: 'Conclusion', order: 4, startLine: 10 }),
    makeBlock({ id: 'p3', type: 'paragraph', content: 'end', order: 5, startLine: 11 }),
  ];

  it('returns empty map for no headings', () => {
    const noHeadings = [makeBlock({ id: 'p1', type: 'paragraph' })];
    const counts = getAnnotationCountBySection(noHeadings, []);
    expect(counts.size).toBe(0);
  });

  it('counts annotations in correct sections', () => {
    const annotations = [
      makeAnnotation({ blockId: 'p1' }),  // belongs to h1 section
      makeAnnotation({ blockId: 'p2' }),  // belongs to h2 section (child of h1)
      makeAnnotation({ blockId: 'p3' }),  // belongs to h1b section
    ];
    const counts = getAnnotationCountBySection(blocks, annotations);
    // h1 section includes p1 and h2/p2 (until h1b)
    expect(counts.get('h1')).toBe(2);
    // h2 section only includes p2 (between h2 and h1b)
    expect(counts.get('h2')).toBe(1);
    // h1b section includes p3
    expect(counts.get('h1b')).toBe(1);
  });

  it('returns zero counts for sections with no annotations', () => {
    const counts = getAnnotationCountBySection(blocks, []);
    expect(counts.get('h1')).toBe(0);
    expect(counts.get('h2')).toBe(0);
    expect(counts.get('h1b')).toBe(0);
  });
});

// ─── buildTocHierarchy ─────────────────────────────────────────────

describe('buildTocHierarchy', () => {
  const blocks: Block[] = [
    makeBlock({ id: 'h1', type: 'heading', level: 1, content: 'Title', order: 0, startLine: 1 }),
    makeBlock({ id: 'h2a', type: 'heading', level: 2, content: 'Section A', order: 1, startLine: 3 }),
    makeBlock({ id: 'h3', type: 'heading', level: 3, content: 'Sub A', order: 2, startLine: 5 }),
    makeBlock({ id: 'h2b', type: 'heading', level: 2, content: 'Section B', order: 3, startLine: 8 }),
  ];

  it('builds nested hierarchy', () => {
    const counts = new Map<string, number>();
    const toc = buildTocHierarchy(blocks, counts);
    expect(toc).toHaveLength(1);  // One root h1
    expect(toc[0].content).toBe('Title');
    expect(toc[0].children).toHaveLength(2);  // h2a and h2b
    expect(toc[0].children[0].content).toBe('Section A');
    expect(toc[0].children[0].children).toHaveLength(1);  // h3
    expect(toc[0].children[1].content).toBe('Section B');
  });

  it('includes annotation counts', () => {
    const counts = new Map([['h1', 3], ['h2a', 1], ['h3', 0], ['h2b', 2]]);
    const toc = buildTocHierarchy(blocks, counts);
    expect(toc[0].annotationCount).toBe(3);
    expect(toc[0].children[0].annotationCount).toBe(1);
    expect(toc[0].children[0].children[0].annotationCount).toBe(0);
    expect(toc[0].children[1].annotationCount).toBe(2);
  });

  it('returns empty for no blocks', () => {
    const toc = buildTocHierarchy([], new Map());
    expect(toc).toHaveLength(0);
  });

  it('handles flat headings (all same level)', () => {
    const flatBlocks: Block[] = [
      makeBlock({ id: 'h1a', type: 'heading', level: 1, content: 'A', order: 0, startLine: 1 }),
      makeBlock({ id: 'h1b', type: 'heading', level: 1, content: 'B', order: 1, startLine: 3 }),
    ];
    const toc = buildTocHierarchy(flatBlocks, new Map());
    expect(toc).toHaveLength(2);
    expect(toc[0].children).toHaveLength(0);
    expect(toc[1].children).toHaveLength(0);
  });
});

// ─── formatFeedback (all 5 types) ──────────────────────────────────

describe('formatFeedback covers all annotation types', () => {
  it('formats DELETION', () => {
    const result = formatFeedback([
      makeAnnotation({ type: AnnotationType.DELETION, originalText: 'remove this' }),
    ]);
    expect(result).toContain('DELETION');
    expect(result).toContain('remove this');
  });

  it('formats INSERTION', () => {
    const result = formatFeedback([
      makeAnnotation({ type: AnnotationType.INSERTION, text: 'add this' }),
    ]);
    expect(result).toContain('INSERTION');
    expect(result).toContain('add this');
  });

  it('formats REPLACEMENT', () => {
    const result = formatFeedback([
      makeAnnotation({
        type: AnnotationType.REPLACEMENT,
        originalText: 'old',
        text: 'new',
      }),
    ]);
    expect(result).toContain('REPLACEMENT');
    expect(result).toContain('old');
    expect(result).toContain('new');
  });

  it('formats COMMENT', () => {
    const result = formatFeedback([
      makeAnnotation({
        type: AnnotationType.COMMENT,
        originalText: 'this part',
        text: 'needs review',
      }),
    ]);
    expect(result).toContain('COMMENT');
    expect(result).toContain('needs review');
  });

  it('formats GLOBAL_COMMENT via globalComments param', () => {
    const result = formatFeedback([], ['Overall great plan']);
    expect(result).toContain('Global Feedback');
    expect(result).toContain('Overall great plan');
  });
});
