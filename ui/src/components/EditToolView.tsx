import React from 'react';

interface EditToolViewProps {
  toolArgs: Record<string, unknown>;
  className?: string;
}

interface DiffLine {
  kind: 'removed' | 'added' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

function getStringArg(toolArgs: Record<string, unknown>, key: string): string {
  const value = toolArgs[key];
  return typeof value === 'string' ? value : '';
}

function buildUnifiedDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const rows: DiffLine[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i += 1) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    const hasOld = oldLine !== undefined;
    const hasNew = newLine !== undefined;

    if (hasOld && hasNew && oldLine === newLine) {
      rows.push({
        kind: 'unchanged',
        oldLineNumber: i + 1,
        newLineNumber: i + 1,
        content: oldLine,
      });
      continue;
    }

    if (hasOld) {
      rows.push({
        kind: 'removed',
        oldLineNumber: i + 1,
        content: oldLine,
      });
    }

    if (hasNew) {
      rows.push({
        kind: 'added',
        newLineNumber: i + 1,
        content: newLine,
      });
    }
  }

  return rows;
}

export const EditToolView: React.FC<EditToolViewProps> = ({ toolArgs, className = '' }) => {
  const file = getStringArg(toolArgs, 'file') || '(unknown file)';
  const oldString = getStringArg(toolArgs, 'old_string');
  const newString = getStringArg(toolArgs, 'new_string');
  const language = getStringArg(toolArgs, 'language') || 'text';
  const diffLines = buildUnifiedDiff(oldString, newString);

  return (
    <section className={`w-full max-w-[832px] 2xl:max-w-5xl bg-card border border-border/50 rounded-xl shadow-xl ${className}`.trim()}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20 rounded-t-xl">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-sm" aria-hidden="true">📝</span>
          <code className="font-mono text-xs md:text-sm text-foreground truncate">{file}</code>
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/15 text-blue-300">EDIT</span>
        </div>
        <span className="px-2 py-0.5 text-[10px] rounded bg-muted text-muted-foreground font-mono">{language}</span>
      </header>

      <div className="max-h-[60vh] overflow-auto">
        <div className="min-w-[720px] font-mono text-xs leading-6">
          {diffLines.map((line, index) => {
            const isRemoved = line.kind === 'removed';
            const isAdded = line.kind === 'added';
            const isUnchanged = line.kind === 'unchanged';

            return (
              <div
                key={`${line.kind}-${index}-${line.oldLineNumber ?? 0}-${line.newLineNumber ?? 0}`}
                className={`grid grid-cols-[56px_56px_1fr] gap-0 border-b border-border/30 ${
                  isRemoved
                    ? 'bg-red-500/10 text-red-400'
                    : isAdded
                      ? 'bg-green-500/10 text-green-400'
                      : 'text-foreground/80'
                }`}
              >
                <span
                  className="px-2 text-right text-[11px] text-muted-foreground/80 select-none"
                  data-old-line={line.oldLineNumber ?? ''}
                >
                  {line.oldLineNumber ?? ''}
                </span>
                <span
                  className="px-2 text-right text-[11px] text-muted-foreground/80 select-none border-r border-border/30"
                  data-new-line={line.newLineNumber ?? ''}
                >
                  {line.newLineNumber ?? ''}
                </span>
                <span className="px-3 whitespace-pre-wrap break-words">
                  {isRemoved ? '- ' : isAdded ? '+ ' : '  '}
                  {isUnchanged && line.content.length === 0 ? ' ' : line.content}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
