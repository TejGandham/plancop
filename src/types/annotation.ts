export type AnnotationType =
  | 'DELETION'
  | 'INSERTION'
  | 'REPLACEMENT'
  | 'COMMENT'
  | 'GLOBAL_COMMENT';

export interface HighlightMeta {
  id: string;
  offset: number;
  textOffset: number;
}

export interface Annotation {
  id: string;            // UUID
  blockId: string;       // Which markdown block this annotation is on
  type: AnnotationType;
  originalText: string;  // Selected text
  text: string;          // Replacement text or comment
  startMeta: HighlightMeta;
  endMeta: HighlightMeta;
  author: string;        // 'reviewer'
  createdAt: number;     // Timestamp
}
