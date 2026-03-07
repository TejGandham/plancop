# ui/ — React Review Interface

React 19 single-page app. Vite 6 build with `vite-plugin-singlefile` — outputs one self-contained HTML file served by the Bun hook server or MCP server.

**Stack:** React 19 · Vite 6 · Tailwind CSS 4 · highlight.js · mermaid · web-highlighter · perfect-freehand

## Structure

```
ui/
├── src/
│   ├── App.tsx                    # Main component — ~861 LOC, all state lives here
│   ├── types.ts                   # UI-specific types (Annotation, Block, EditorMode)
│   ├── index.css                  # Tailwind imports + custom styles
│   ├── components/                # ~20 components
│   │   ├── Viewer.tsx             # Markdown viewer with web-highlighter annotations (~951 LOC)
│   │   ├── Settings.tsx           # User preferences panel (~191 LOC)
│   │   ├── AnnotationPanel.tsx    # Right sidebar — annotation list, edit, delete
│   │   ├── AnnotationSidebar.tsx  # Sidebar wrapper for annotation panel
│   │   ├── AnnotationToolbar.tsx  # Toolbar for annotation actions
│   │   ├── TableOfContents.tsx    # Left sidebar — heading nav, annotation counts
│   │   ├── ThemeProvider.tsx      # Dark/light/system theme context
│   │   ├── ModeToggle.tsx         # Dark mode toggle button
│   │   ├── ModeSwitcher.tsx       # Editor mode switcher (selection/comment/redline)
│   │   ├── CompletionOverlay.tsx  # Post-submission overlay
│   │   ├── ConfirmDialog.tsx      # Generic confirm dialog
│   │   ├── ErrorBoundary.tsx      # React error boundary
│   │   ├── LoadingScreen.tsx      # Loading state
│   │   ├── MermaidBlock.tsx       # Mermaid diagram renderer
│   │   ├── ResizeHandle.tsx       # Draggable panel resize handle
│   │   ├── AttachmentsButton.tsx  # Image attachment handling
│   │   ├── ImageThumbnail.tsx     # Image preview thumbnail
│   │   ├── sidebar/               # 2 files — sidebar container + tabs
│   │   └── ImageAnnotator/        # 5 files — image markup with freehand drawing
│   ├── hooks/                     # 5 custom hooks
│   │   ├── useSidebar.ts          # Sidebar open/close, active tab
│   │   ├── useActiveSection.ts    # Track heading in viewport (IntersectionObserver)
│   │   ├── useResizablePanel.ts   # Draggable panel resize with cookie persistence
│   │   ├── useAutoClose.ts        # Auto-close tab after delay
│   │   └── useDismissOnOutsideAndEscape.ts
│   ├── utils/                     # 6 utilities
│   │   ├── parser.ts              # parseMarkdownToBlocks(), extractFrontmatter()
│   │   ├── feedback.ts            # formatFeedback() — annotations → human-readable text
│   │   ├── storage.ts             # Cookie-based getItem/setItem (NOT localStorage)
│   │   ├── annotationHelpers.ts   # Annotation manipulation helpers
│   │   ├── editorMode.ts          # Editor mode helpers
│   │   └── uiPreferences.ts       # UI preference helpers
│   └── __tests__/                 # 2 test files (shortcuts, reviewApi)
├── vite.config.ts                 # Single-file build, @tailwindcss/vite, React plugin
├── package.json                   # Own deps (react, tailwind, mermaid, etc.)
├── index.html                     # Vite entry point
└── public/                        # Static assets
```

## State Management

**No external library.** All state in `App.tsx` via `useState` hooks. Props flow down, callbacks flow up.

Key state groups:
- **Content**: `markdown`, `annotations`, `blocks`, `frontmatter`
- **UI**: `isPanelOpen`, `editorMode`, `showFeedbackPrompt`
- **Submission**: `isSubmitting`, `submitted`

Custom hooks isolate concerns: `useSidebar` (panel state), `useActiveSection` (viewport tracking), `useResizablePanel` (drag resize).

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add component | `src/components/` | State lives in App.tsx; pass via props |
| Add custom hook | `src/hooks/` | Return object, no side effects in body |
| Add utility | `src/utils/` | Pure functions preferred |
| Persist setting | `src/utils/storage.ts` | Uses cookies — see below |
| Add test | `src/__tests__/` or `src/components/__tests__/` | vi.fn() for fetch mock |
| Change theme | `src/components/ThemeProvider.tsx` | CSS variables on \<html\> |
| Add keyboard shortcut | `App.tsx` useEffect handlers | Check existing bindings first |
| Modify build | `vite.config.ts` | Single-file output via viteSingleFile plugin |

## Conventions

- **Cookies, not localStorage** — `storage.ts` wraps cookies because port changes each invocation. localStorage is origin-scoped (includes port) so data would be lost.
- **No routing** — Single-page app. Modals/sidebars for navigation.
- **Tailwind CSS 4** — `@tailwindcss/vite` plugin. No tailwind.config.js needed. CSS variables for theming.
- **Single-file build** — `vite-plugin-singlefile` inlines all JS/CSS into one HTML file (~5MB). Server reads this directly.
- **Annotation types** — DELETION, INSERTION, REPLACEMENT, COMMENT, GLOBAL_COMMENT (see `types.ts`)
- **Editor modes** — selection (select text), comment (add comments), redline (strikethrough)

## Anti-Patterns

- `localStorage` — Use `storage.ts` (cookies). localStorage breaks across ports.
- Adding npm deps — Check if existing deps cover the use case first. Bundle size matters (single-file build).
- Side effects in hooks — Custom hooks return objects, never trigger side effects on import.
- Direct DOM manipulation — Use React refs. Exception: web-highlighter manages its own DOM.

## Test Patterns

```typescript
// Mocking fetch
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
await postApproveDecision(fetchMock as unknown as typeof fetch);
expect(fetchMock).toHaveBeenCalledWith('/api/approve', { method: 'POST' });
```

- Environment: happy-dom (via vitest.config.ts)
- Component tests in `components/__tests__/` — Viewer
- API tests in `__tests__/` — shortcuts, reviewApi
- No E2E tests

## Coverage

These UI files have enforced thresholds (90% lines/funcs, 80% branches):
- `utils/feedback.ts`, `utils/parser.ts`, `utils/annotationHelpers.ts`

## Gotchas

- **App.tsx is ~861 LOC** — All state lives here. Read it before modifying any component.
- **web-highlighter** — `@plannotator/web-highlighter` manages annotation DOM. Don't fight it.
- **Build required** — Server reads `ui/dist/index.html`. Always `npm run build` after UI changes.
- **No hot reload in production** — Dev server is `npm run dev` (port 5173). Production is served by hook server.
