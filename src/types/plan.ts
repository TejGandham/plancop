import type { Annotation } from './annotation.js';

export interface PlanData {
  plan: string;
  origin?: string;
  permissionMode?: string;
  sharingEnabled?: boolean;
  shareBaseUrl?: string;
  previousPlan?: string | null;
  versionInfo?: { version: number; totalVersions: number; project: string };
}

/** Payload for URL-based sharing. Compressed with deflate-raw, base64url encoded. */
export interface SharePayload {
  p: string;              // Plan markdown
  a: Annotation[];        // Annotations
  g: Annotation[];        // Global comments (type: GLOBAL_COMMENT)
  v: number;              // Schema version (currently: 1)
}
