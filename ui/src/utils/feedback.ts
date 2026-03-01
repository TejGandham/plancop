import type { Annotation } from '../types'
import { AnnotationType } from '../types'

/**
 * Format plan review annotations into human-readable feedback text.
 *
 * Uses startOffset/endOffset as line references for each annotation.
 * Produces a structured markdown-like report suitable for sharing
 * with plan authors or feeding into an LLM.
 */
export function formatFeedback(annotations: Annotation[], globalComments: string[] = []): string {
  const header = 'PLAN REVIEW FEEDBACK\n===================='

  if (annotations.length === 0 && globalComments.length === 0) {
    return `${header}\n\nNo annotations.`
  }

  const parts: string[] = [header]

  if (annotations.length === 0) {
    parts.push('', 'No annotations.')
  } else {
    parts.push('', `## Annotations (${annotations.length})`)

    for (const a of annotations) {
      const lineRef =
        a.startOffset === a.endOffset
          ? `line ${a.startOffset}`
          : `line ${a.startOffset}-${a.endOffset}`

      parts.push('')

      switch (a.type) {
        case AnnotationType.DELETION:
          parts.push(`### DELETION (${lineRef})`)
          parts.push(quoteText(a.originalText))
          parts.push('Reviewer wants this section removed.')
          break

        case AnnotationType.REPLACEMENT:
          parts.push(`### REPLACEMENT (${lineRef})`)
          parts.push(quoteText(a.originalText))
          parts.push(`Replace with: "${a.text ?? ''}"`)
          break

        case AnnotationType.COMMENT:
          parts.push(`### COMMENT (${lineRef})`)
          parts.push(quoteText(a.originalText))
          parts.push(`"${a.text ?? ''}"`)
          break

        case AnnotationType.INSERTION:
          parts.push(`### INSERTION (${lineRef})`)
          parts.push(`Insert: "${a.text ?? ''}"`)
          break
      }
    }
  }

  if (globalComments.length > 0) {
    parts.push('', '## Global Feedback')
    for (const gc of globalComments) {
      parts.push(`- ${gc}`)
    }
  }

  return parts.join('\n')
}

function quoteText(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}
