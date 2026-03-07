import React, { useState, useEffect, useMemo, useRef } from 'react';
import { parseMarkdownToBlocks, exportAnnotations, extractFrontmatter, Frontmatter } from './utils/parser';
import { Viewer, ViewerHandle } from './components/Viewer';
import { AnnotationPanel } from './components/AnnotationPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Annotation, Block, EditorMode, type ImageAttachment } from './types';
import { ThemeProvider } from './components/ThemeProvider';
import { ModeToggle } from './components/ModeToggle';
import { ModeSwitcher } from './components/ModeSwitcher';
import { Settings } from './components/Settings';
import { useActiveSection } from './hooks/useActiveSection';
import { CompletionOverlay } from './components/CompletionOverlay';
import { getUIPreferences, type UIPreferences } from './utils/uiPreferences';
import { getEditorMode, saveEditorMode } from './utils/editorMode';
import { useResizablePanel } from './hooks/useResizablePanel';
import { ResizeHandle } from './components/ResizeHandle';
import { ImageAnnotator } from './components/ImageAnnotator';
import { deriveImageName } from './components/AttachmentsButton';
import { useSidebar } from './hooks/useSidebar';
import { SidebarTabs } from './components/sidebar/SidebarTabs';
import { TableOfContents } from './components/TableOfContents';
import { formatFeedback } from './utils/feedback';
import { LoadingScreen } from './components/LoadingScreen';

const PLAN_CONTENT = `# Implementation Plan: Real-time Collaboration

## Overview
Add real-time collaboration features to the editor using WebSocket connections and operational transforms.

### Architecture

\`\`\`mermaid
flowchart LR
    subgraph Client["Client Browser"]
        UI[React UI] --> OT[OT Engine]
        OT <--> WS[WebSocket Client]
    end

    subgraph Server["Backend"]
        WSS[WebSocket Server] <--> OTS[OT Transform]
        OTS <--> DB[(PostgreSQL)]
    end

    WS <--> WSS
\`\`\`

## Phase 1: Infrastructure

### WebSocket Server
Set up a WebSocket server to handle concurrent connections:

\`\`\`typescript
const server = new WebSocketServer({ port: 8080 });
\`\`\`

## Phase 2: Operational Transform

### Core Algorithm
Implement the OT algorithm for conflict resolution:

\`\`\`typescript
interface Operation {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
}

function transform(op1: Operation, op2: Operation): [Operation, Operation] {
  // Transform op1 against op2 and vice versa
  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op1.position <= op2.position) {
      return [op1, { ...op2, position: op2.position + (op1.content?.length ?? 0) }];
    }
    return [{ ...op1, position: op1.position + (op2.content?.length ?? 0) }, op2];
  }
  return [op1, op2];
}
\`\`\`

## Phase 3: Client Integration

### React Hook
\`\`\`typescript
function useCollaboration(documentId: string) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(\`ws://localhost:8080/doc/\${documentId}\`);
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'collaborators') {
        setCollaborators(data.collaborators);
      }
    };
    return () => ws.current?.close();
  }, [documentId]);

  return { collaborators };
}
\`\`\`

## Phase 4: Cursor Tracking

### Cursor Overlay Component
\`\`\`typescript
import React, { useEffect, useState } from 'react';
import { useCollaboration } from './hooks/useCollaboration';

interface CursorOverlayProps {
  documentId: string;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const CursorOverlay: React.FC<CursorOverlayProps> = ({
  documentId,
  containerRef
}) => {
  const { collaborators, currentUser } = useCollaboration(documentId);
  const [positions, setPositions] = useState<Map<string, DOMRect>>(new Map());

  useEffect(() => {
    const updatePositions = () => {
      const newPositions = new Map<string, DOMRect>();
      collaborators.forEach(collab => {
        if (collab.userId !== currentUser.id && collab.cursorPosition) {
          const rect = getCursorRect(containerRef.current, collab.cursorPosition);
          if (rect) newPositions.set(collab.userId, rect);
        }
      });
      setPositions(newPositions);
    };

    const interval = setInterval(updatePositions, 50);
    return () => clearInterval(interval);
  }, [collaborators, currentUser, containerRef]);

  return (
    <>
      {Array.from(positions.entries()).map(([userId, rect]) => (
        <div
          key={userId}
          className="absolute pointer-events-none transition-all duration-75"
          style={{
            left: rect.left,
            top: rect.top,
            height: rect.height,
          }}
        >
          <div className="w-0.5 h-full bg-blue-500 animate-pulse" />
          <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-blue-500
                          text-white text-xs rounded whitespace-nowrap">
            {collaborators.find(c => c.userId === userId)?.userName}
          </div>
        </div>
      ))}
    </>
  );
};
\`\`\`

### Configuration
\`\`\`json
{
  "collaboration": {
    "enabled": true,
    "maxCollaborators": 10,
    "cursorColors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"],
    "syncInterval": 100,
    "reconnect": {
      "maxAttempts": 5,
      "backoffMultiplier": 1.5,
      "initialDelay": 1000
    }
  }
}
\`\`\`

---

## Pre-launch Checklist

- [ ] Infrastructure ready
  - [x] WebSocket server deployed
  - [x] Database migrations applied
  - [ ] Load balancer configured
    - [ ] SSL certificates installed
    - [ ] Health checks enabled
      - [ ] /health endpoint returns 200
      - [ ] /ready endpoint checks DB connection
        - [ ] Primary database
        - [ ] Read replicas
          - [ ] us-east-1 replica
          - [ ] eu-west-1 replica
- [ ] Security audit complete
  - [x] Authentication flow reviewed
  - [ ] Rate limiting implemented
    - [x] 100 req/min for anonymous users
    - [ ] 1000 req/min for authenticated users
  - [ ] Input sanitization verified
- [x] Documentation updated
  - [x] API reference generated
  - [x] Integration guide written
  - [ ] Video tutorials recorded

### Mixed List Styles

* Asterisk item at level 0
  - Dash item at level 1
    * Asterisk at level 2
      - Dash at level 3
        * Asterisk at level 4
          - Maximum reasonable depth
1. Numbered item
   - Sub-bullet under numbered
   - Another sub-bullet
     1. Nested numbered list
     2. Second nested number

---

**Target:** Ship MVP in next sprint
`;

type FetchImpl = typeof fetch;

function getSessionToken(): string {
  return (window as Record<string, unknown>).__PLANCOP_TOKEN__ as string ?? '';
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Authorization': `Bearer ${getSessionToken()}`, ...extra };
}

export async function postApproveDecision(fetchImpl: FetchImpl = fetch): Promise<void> {
  await fetchImpl('/api/approve', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function postDenyDecision(
  annotations: Annotation[],
  fetchImpl: FetchImpl = fetch
): Promise<string> {
  const reason = formatFeedback(annotations, []);

  await fetchImpl('/api/deny', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reason }),
  });

  return reason;
}

const getIdentity = () => 'reviewer';
const isCurrentUser = () => true;

const App: React.FC = () => {
  const [markdown, setMarkdown] = useState(PLAN_CONTENT);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [frontmatter, setFrontmatter] = useState<Frontmatter | null>(null);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [showClaudeCodeWarning, setShowClaudeCodeWarning] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode>(getEditorMode);
  const [uiPrefs, setUiPrefs] = useState<UIPreferences>(getUIPreferences);
  const [isApiMode, setIsApiMode] = useState(false);
  const [origin, setOrigin] = useState<'claude-code' | 'copilot-cli' | 'opencode' | 'pi' | null>(null);
  const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<'approved' | 'denied' | null>(null);
  const [pendingPasteImage, setPendingPasteImage] = useState<{ file: File; blobUrl: string; initialName: string } | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ display: string; branch?: string } | null>(null);

  const viewerRef = useRef<ViewerHandle>(null);
  const containerRef = useRef<HTMLElement>(null!);

  const panelResize = useResizablePanel({ storageKey: 'plancop-panel-width' });
  const tocResize = useResizablePanel({
    storageKey: 'plancop-toc-width',
    defaultWidth: 240,
    minWidth: 160,
    maxWidth: 400,
    side: 'left',
  });
  const isResizing = panelResize.isDragging || tocResize.isDragging;

  const sidebar = useSidebar(getUIPreferences().tocEnabled);

  useEffect(() => {
    if (uiPrefs.tocEnabled) {
      sidebar.open('toc');
    } else {
      sidebar.close();
    }
  }, [uiPrefs.tocEnabled, sidebar]);

  const headingCount = useMemo(() => blocks.filter((block) => block.type === 'heading').length, [blocks]);
  const activeSection = useActiveSection(containerRef, headingCount);

  const handleEditorModeChange = (mode: EditorMode) => {
    setEditorMode(mode);
    saveEditorMode(mode);
  };

  useEffect(() => {
    let cancelled = false;
    const maxRetries = 5;
    const retryDelayMs = 500;

    const applyPlanData = (data: {
      plan: string;
      origin?: 'claude-code' | 'copilot-cli' | 'opencode' | 'pi';
      mode?: 'annotate';
      repoInfo?: { display: string; branch?: string };
    }) => {
      if (cancelled) return;
      setMarkdown(data.plan);
      setIsApiMode(true);
      if (data.mode === 'annotate') {
        setAnnotateMode(true);
      }
      if (data.origin) {
        setOrigin(data.origin);
      }
      if (data.repoInfo) {
        setRepoInfo(data.repoInfo);
      }
    };

    const fetchPlan = async (attempt: number): Promise<void> => {
      try {
        const res = await fetch('/api/plan', { headers: authHeaders() });
        if (!res.ok) throw new Error('Not in API mode');
        const data = await res.json();
        applyPlanData(data);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          if (!cancelled) await fetchPlan(attempt + 1);
        } else {
          setIsApiMode(false);
          setIsLoading(false);
        }
      }
    };

    fetchPlan(1);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const { frontmatter: fm } = extractFrontmatter(markdown);
    setFrontmatter(fm);
    setBlocks(parseMarkdownToBlocks(markdown));
  }, [markdown]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const initialName = deriveImageName(file.name, globalAttachments.map((img) => img.name));
            const blobUrl = URL.createObjectURL(file);
            setPendingPasteImage({ file, blobUrl, initialName });
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [globalAttachments]);

  const handlePasteAnnotatorAccept = async (blob: Blob, hasDrawings: boolean, name: string) => {
    if (!pendingPasteImage) return;

    try {
      const formData = new FormData();
      const fileToUpload = hasDrawings
        ? new File([blob], 'annotated.png', { type: 'image/png' })
        : pendingPasteImage.file;
      formData.append('file', fileToUpload);

      const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: formData });
      if (res.ok) {
        const data = await res.json();
        setGlobalAttachments((prev) => [...prev, { path: data.path, name }]);
      }
    } catch {
    } finally {
      URL.revokeObjectURL(pendingPasteImage.blobUrl);
      setPendingPasteImage(null);
    }
  };

  const handlePasteAnnotatorClose = () => {
    if (pendingPasteImage) {
      URL.revokeObjectURL(pendingPasteImage.blobUrl);
      setPendingPasteImage(null);
    }
  };

  const annotationsOutput = useMemo(() => {
    if (annotations.length === 0 && globalAttachments.length === 0) {
      return 'No changes detected.';
    }
    return exportAnnotations(blocks, annotations, globalAttachments);
  }, [blocks, annotations, globalAttachments]);

  const reviewState = isLoading
    ? 'loading'
    : submitted === 'approved'
      ? 'approved'
      : submitted === 'denied'
        ? 'denied'
        : 'reviewing';

  const canSubmitReviewActions = isApiMode && reviewState === 'reviewing';

  const handleApprove = async () => {
    if (!canSubmitReviewActions || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await postApproveDecision();
      setSubmitted('approved');
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async () => {
    if (!canSubmitReviewActions || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await postDenyDecision(annotations);
      setSubmitted('denied');
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleFeedback = async () => {
    if (!canSubmitReviewActions || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          feedback: annotationsOutput,
          annotations,
        }),
      });
      setSubmitted('denied');
    } catch {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;

      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (showFeedbackPrompt || showClaudeCodeWarning || pendingPasteImage) return;
      if (submitted || isSubmitting) return;
      if (!isApiMode) return;

      event.preventDefault();

      if (annotateMode) {
        if (annotations.length === 0) {
          setShowFeedbackPrompt(true);
        } else {
          handleFeedback();
        }
        return;
      }

      if (annotations.length === 0) {
        handleApprove();
      } else {
        handleDeny();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFeedbackPrompt, showClaudeCodeWarning, pendingPasteImage, submitted, isSubmitting, isApiMode, annotateMode, annotations.length]);

  useEffect(() => {
    const handleDenyShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || !event.shiftKey) return;

      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (showFeedbackPrompt || showClaudeCodeWarning || pendingPasteImage) return;
      if (submitted || isSubmitting) return;
      if (!isApiMode) return;

      event.preventDefault();

      if (annotateMode) {
        if (annotations.length === 0) {
          setShowFeedbackPrompt(true);
        } else {
          handleFeedback();
        }
        return;
      }

      handleDeny();
    };

    window.addEventListener('keydown', handleDenyShortcut);
    return () => window.removeEventListener('keydown', handleDenyShortcut);
  }, [showFeedbackPrompt, showClaudeCodeWarning, pendingPasteImage, submitted, isSubmitting, isApiMode, annotateMode, annotations.length]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (showFeedbackPrompt) {
        setShowFeedbackPrompt(false);
        event.preventDefault();
        return;
      }

      if (showClaudeCodeWarning) {
        setShowClaudeCodeWarning(false);
        event.preventDefault();
        return;
      }

      if (pendingPasteImage) {
        handlePasteAnnotatorClose();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [showFeedbackPrompt, showClaudeCodeWarning, pendingPasteImage]);

  const handleAddAnnotation = (annotation: Annotation) => {
    const withAuthor = annotation.author || isCurrentUser()
      ? { ...annotation, author: annotation.author ?? getIdentity() }
      : annotation;
    setAnnotations((prev) => [...prev, withAuthor]);
    setSelectedAnnotationId(annotation.id);
    setIsPanelOpen(true);
  };

  const handleDeleteAnnotation = (id: string) => {
    viewerRef.current?.removeHighlight(id);
    setAnnotations((prev) => prev.filter((annotation) => annotation.id !== id));
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
    }
  };

  const handleEditAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) => prev.map((annotation) => (
      annotation.id === id ? { ...annotation, ...updates } : annotation
    )));
  };

  const handleAddGlobalAttachment = (image: ImageAttachment) => {
    setGlobalAttachments((prev) => [...prev, image]);
  };

  const handleRemoveGlobalAttachment = (path: string) => {
    setGlobalAttachments((prev) => prev.filter((image) => image.path !== path));
  };

  const handleTocNavigate = (blockId: string) => {
    const target = containerRef.current?.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const agentName = useMemo(() => {
    if (origin === 'opencode') return 'OpenCode';
    if (origin === 'claude-code') return 'Claude Code';
    if (origin === 'copilot-cli') return 'Copilot CLI';
    if (origin === 'pi') return 'Pi';
    return 'Coding Agent';
  }, [origin]);

  return (
    <ThemeProvider defaultTheme="dark">
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <header className="h-12 flex items-center justify-between px-2 md:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-20">
            <div className="flex items-center gap-2 md:gap-3">
              <span className="text-sm font-semibold tracking-tight">Plancop</span>
              <a
                href="https://github.com/TejGandham/plancop/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground font-mono opacity-60 hidden md:inline hover:opacity-100 transition-opacity"
              >
                v0.0.0
              </a>
              {origin && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium hidden md:inline ${
                  origin === 'claude-code'
                    ? 'bg-orange-500/15 text-orange-400'
                    : origin === 'copilot-cli'
                      ? 'bg-blue-500/15 text-blue-400'
                      : origin === 'pi'
                        ? 'bg-violet-500/15 text-violet-400'
                        : 'bg-zinc-500/20 text-zinc-400'
                }`}>
                  {agentName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              {canSubmitReviewActions && (
                <>
                  <button
                    onClick={() => {
                      if (annotations.length === 0) {
                        setShowFeedbackPrompt(true);
                      } else if (annotateMode) {
                        handleFeedback();
                      } else {
                        handleDeny();
                      }
                    }}
                    disabled={isSubmitting}
                    className={`p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-medium transition-all ${
                      isSubmitting
                        ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                        : 'bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30'
                    }`}
                    title="Send Feedback"
                  >
                    <svg className="w-4 h-4 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="hidden md:inline">{isSubmitting ? 'Sending...' : annotateMode ? 'Send Annotations' : 'Send Feedback'}</span>
                  </button>

                  {!annotateMode && (
                    <div className="relative group/approve">
                      <button
                        onClick={() => {
                          if (origin === 'claude-code' && annotations.length > 0) {
                            setShowClaudeCodeWarning(true);
                            return;
                          }
                          handleApprove();
                        }}
                        disabled={isSubmitting}
                        className={`px-2 py-1 md:px-2.5 rounded-md text-xs font-medium transition-all ${
                          isSubmitting
                            ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                            : origin === 'claude-code' && annotations.length > 0
                              ? 'bg-success/50 text-success-foreground/70 hover:bg-success hover:text-success-foreground'
                              : 'bg-success text-success-foreground hover:opacity-90'
                        }`}
                      >
                        <span className="md:hidden">{isSubmitting ? '...' : 'OK'}</span>
                        <span className="hidden md:inline">{isSubmitting ? 'Approving...' : 'Approve'}</span>
                      </button>
                      {origin === 'claude-code' && annotations.length > 0 && (
                        <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-xl text-xs text-foreground w-56 text-center opacity-0 invisible group-hover/approve:opacity-100 group-hover/approve:visible transition-all pointer-events-none z-50">
                          <div className="absolute bottom-full right-4 border-4 border-transparent border-b-border" />
                          <div className="absolute bottom-full right-4 mt-px border-4 border-transparent border-b-popover" />
                          {agentName} does not support feedback on approval. Your annotations will not be included.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
                </>
              )}

              <ModeToggle />
              <Settings onUIPreferencesChange={setUiPrefs} />

              <button
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                  isPanelOpen
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </button>
            </div>
          </header>

          <div className={`flex-1 flex overflow-hidden ${isResizing ? 'select-none' : ''}`}>
            {!sidebar.isOpen && (
              <SidebarTabs
                activeTab={sidebar.activeTab}
                onToggleTab={sidebar.toggleTab}
                className="hidden lg:flex"
              />
            )}

            {sidebar.isOpen && (
              <>
                <aside
                  className="hidden lg:flex flex-col sticky top-12 h-[calc(100vh-3rem)] flex-shrink-0 bg-card/50 backdrop-blur-sm border-r border-border"
                  style={{ width: tocResize.width }}
                >
                  <div className="flex items-center border-b border-border/50 px-2 py-1.5 gap-1 flex-shrink-0">
                    <button
                      onClick={sidebar.close}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Close sidebar"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Contents</span>
                  </div>
                  <TableOfContents
                    blocks={blocks}
                    annotations={annotations}
                    activeId={activeSection}
                    onNavigate={handleTocNavigate}
                    className="flex-1 overflow-y-auto"
                  />
                </aside>
                <ResizeHandle {...tocResize.handleProps} className="hidden lg:block" />
              </>
            )}

            <main ref={containerRef} className="flex-1 min-w-0 overflow-y-auto bg-grid">
              <div className="min-h-full flex flex-col items-center px-4 py-3 md:px-10 md:py-8 xl:px-16">
                <div className="w-full max-w-[832px] 2xl:max-w-5xl mb-3 md:mb-4 flex justify-start">
                  <ModeSwitcher mode={editorMode} onChange={handleEditorModeChange} />
                </div>

                <Viewer
                  ref={viewerRef}
                  blocks={blocks}
                  markdown={markdown}
                  frontmatter={frontmatter}
                  annotations={annotations}
                  onAddAnnotation={handleAddAnnotation}
                  onSelectAnnotation={setSelectedAnnotationId}
                  selectedAnnotationId={selectedAnnotationId}
                  mode={editorMode}
                  globalAttachments={globalAttachments}
                  onAddGlobalAttachment={handleAddGlobalAttachment}
                  onRemoveGlobalAttachment={handleRemoveGlobalAttachment}
                  stickyActions={uiPrefs.stickyActionsEnabled}
                  repoInfo={repoInfo}
                />
              </div>
            </main>

            {isPanelOpen && <ResizeHandle {...panelResize.handleProps} />}

            <AnnotationPanel
              isOpen={isPanelOpen}
              blocks={blocks}
              annotations={annotations}
              selectedId={selectedAnnotationId}
              onSelect={setSelectedAnnotationId}
              onDelete={handleDeleteAnnotation}
              onEdit={handleEditAnnotation}
              width={panelResize.width}
            />
          </div>

          <ConfirmDialog
            isOpen={showFeedbackPrompt}
            onClose={() => setShowFeedbackPrompt(false)}
            title="Add Annotations First"
            message={`To provide feedback, select text in the plan and add annotations. ${agentName} will use your annotations to revise the plan.`}
            variant="info"
          />

          <ConfirmDialog
            isOpen={showClaudeCodeWarning}
            onClose={() => setShowClaudeCodeWarning(false)}
            onConfirm={() => {
              setShowClaudeCodeWarning(false);
              handleApprove();
            }}
            title="Annotations Won't Be Sent"
            message={<>{agentName} does not yet support feedback on approval. Your {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} will be lost.</>}
            subMessage={
              <>
                To send feedback, use <strong>Send Feedback</strong> instead.
                <br /><br />
                Want this feature? Upvote these issues:
                <br />
                <a href="https://github.com/anthropics/claude-code/issues/16001" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">#16001</a>
                {' · '}
                <a href="https://github.com/anthropics/claude-code/issues/15755" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">#15755</a>
              </>
            }
            confirmText="Approve Anyway"
            cancelText="Cancel"
            variant="warning"
            showCancel
          />

          <CompletionOverlay
            submitted={submitted}
            title={
              submitted === 'approved'
                ? 'Plan approved ✓ — you can close this tab'
                : annotateMode
                  ? 'Annotations Sent'
                  : 'Plan denied — feedback sent to agent'
            }
            subtitle={
              submitted === 'approved'
                ? ''
                : annotateMode
                  ? `${agentName} will address your annotations on the file.`
                  : ''
            }
            agentLabel={agentName}
          />

          <ImageAnnotator
            isOpen={!!pendingPasteImage}
            imageSrc={pendingPasteImage?.blobUrl ?? ''}
            initialName={pendingPasteImage?.initialName}
            onAccept={handlePasteAnnotatorAccept}
            onClose={handlePasteAnnotatorClose}
          />
        </div>
      )}
    </ThemeProvider>
  );
};

export default App;
