import React from 'react';

interface CreateToolViewProps {
  toolArgs: Record<string, unknown>;
  className?: string;
}

function getStringArg(toolArgs: Record<string, unknown>, key: string): string {
  const value = toolArgs[key];
  return typeof value === 'string' ? value : '';
}

export const CreateToolView: React.FC<CreateToolViewProps> = ({ toolArgs, className = '' }) => {
  const file = getStringArg(toolArgs, 'file') || '(unknown file)';
  const content = getStringArg(toolArgs, 'content');
  const language = getStringArg(toolArgs, 'language') || 'text';
  const lines = content.split('\n');

  return (
    <section className={`w-full max-w-[832px] 2xl:max-w-5xl bg-card border border-border/50 rounded-xl shadow-xl ${className}`.trim()}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20 rounded-t-xl">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-sm" aria-hidden="true">📄</span>
          <code className="font-mono text-xs md:text-sm text-foreground truncate">{file}</code>
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-green-500/15 text-green-300">NEW FILE</span>
        </div>
        <span className="px-2 py-0.5 text-[10px] rounded bg-muted text-muted-foreground font-mono">{language}</span>
      </header>

      <div className="max-h-[60vh] overflow-auto bg-zinc-950/80 rounded-b-xl">
        <div className="min-w-[720px] font-mono text-xs leading-6 text-zinc-100">
          {lines.map((line, index) => (
            <div key={`${index}-${line}`} className="grid grid-cols-[56px_1fr] border-b border-zinc-800/70">
              <span
                className="px-2 text-right text-[11px] text-zinc-500 select-none border-r border-zinc-800/70"
                data-line={index + 1}
              >
                {index + 1}
              </span>
              <span className="px-3 whitespace-pre-wrap break-words">{line.length === 0 ? ' ' : line}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
