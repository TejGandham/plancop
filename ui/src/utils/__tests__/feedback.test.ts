import { describe, it, expect } from 'vitest'
import { formatFeedback } from '../feedback'
import { AnnotationType } from '../../types'
import type { Annotation } from '../../types'

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'test-id',
    blockId: 'block-1',
    startOffset: 1,
    endOffset: 1,
    type: AnnotationType.COMMENT,
    originalText: 'selected text',
    createdA: Date.now(),
    ...overrides,
  }
}

describe('formatFeedback', () => {
  it('returns clean output with 0 annotations', () => {
    const result = formatFeedback([])
    expect(result).toBe('PLAN REVIEW FEEDBACK\n====================\n\nNo annotations.')
    expect(result).not.toContain('0 annotations')
  })

  it('formats a single COMMENT annotation', () => {
    const annotation = makeAnnotation({
      type: AnnotationType.COMMENT,
      startOffset: 5,
      endOffset: 10,
      originalText: 'some text here',
      text: 'This needs revision',
    })
    const result = formatFeedback([annotation])

    expect(result).toContain('## Annotations (1)')
    expect(result).toContain('### COMMENT (line 5-10)')
    expect(result).toContain('> some text here')
    expect(result).toContain('"This needs revision"')
  })

  it('formats mixed annotation types correctly', () => {
    const annotations: Annotation[] = [
      makeAnnotation({
        id: '1',
        type: AnnotationType.DELETION,
        startOffset: 3,
        endOffset: 7,
        originalText: 'delete this section',
      }),
      makeAnnotation({
        id: '2',
        type: AnnotationType.REPLACEMENT,
        startOffset: 10,
        endOffset: 10,
        originalText: 'old text',
        text: 'new text',
      }),
      makeAnnotation({
        id: '3',
        type: AnnotationType.COMMENT,
        startOffset: 15,
        endOffset: 20,
        originalText: 'commented section',
        text: 'Please clarify',
      }),
      makeAnnotation({
        id: '4',
        type: AnnotationType.INSERTION,
        startOffset: 25,
        endOffset: 25,
        text: 'inserted content',
      }),
    ]
    const result = formatFeedback(annotations)
    expect(result).toContain('## Annotations (4)')

    // DELETION
    expect(result).toContain('### DELETION (line 3-7)')
    expect(result).toContain('> delete this section')
    expect(result).toContain('Reviewer wants this section removed.')

    // REPLACEMENT
    expect(result).toContain('### REPLACEMENT (line 10)')
    expect(result).toContain('> old text')
    expect(result).toContain('Replace with: "new text"')

    // COMMENT
    expect(result).toContain('### COMMENT (line 15-20)')
    expect(result).toContain('> commented section')
    expect(result).toContain('"Please clarify"')

    // INSERTION
    expect(result).toContain('### INSERTION (line 25)')
    expect(result).toContain('Insert: "inserted content"')
  })

  it('appends global comments at end', () => {
    const annotation = makeAnnotation({
      type: AnnotationType.COMMENT,
      startOffset: 1,
      endOffset: 1,
      originalText: 'text',
      text: 'a comment',
    })

    const result = formatFeedback([annotation], ['Great plan overall', 'Consider timeline'])

    expect(result).toContain('## Global Feedback')
    expect(result).toContain('- Great plan overall')
    expect(result).toContain('- Consider timeline')

    // Global feedback should be after annotations
    const annotationsIdx = result.indexOf('## Annotations')
    const globalIdx = result.indexOf('## Global Feedback')
    expect(globalIdx).toBeGreaterThan(annotationsIdx)
  })

  it('formats 5 annotations with all present', () => {
    const annotations: Annotation[] = Array.from({ length: 5 }, (_, i) =>
      makeAnnotation({
        id: `ann-${i}`,
        type: AnnotationType.COMMENT,
        startOffset: i + 1,
        endOffset: i + 2,
        originalText: `text block ${i + 1}`,
        text: `feedback ${i + 1}`,
      })
    )

    const result = formatFeedback(annotations)
    expect(result).toContain('## Annotations (5)')
    for (let i = 0; i < 5; i++) {
      expect(result).toContain(`> text block ${i + 1}`)
      expect(result).toContain(`"feedback ${i + 1}"`)
    }
  })

  it('omits Global Feedback section when no global comments', () => {
    const result = formatFeedback([
      makeAnnotation({ type: AnnotationType.COMMENT, text: 'note' }),
    ])
    expect(result).not.toContain('## Global Feedback')
  })
})
