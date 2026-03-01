import type { EditToolArgs, CreateToolArgs } from './hook.js';
import type { Annotation } from './annotation.js';

export interface PlanData {
  plan: string;                              // Plan markdown or file content
  toolName: string;                          // Which tool was intercepted
  toolArgs: EditToolArgs | CreateToolArgs | Record<string, unknown>;
  cwd: string;                               // Working directory
  timestamp: number;
}

/** Payload for URL-based sharing. Compressed with deflate-raw, base64url encoded. */
export interface SharePayload {
  p: string;              // Plan markdown
  a: Annotation[];        // Annotations
  t: string;              // toolName
  g: Annotation[];        // Global comments (type: GLOBAL_COMMENT)
  v: number;              // Schema version (currently: 1)
}
