import React from 'react';
import { EditToolView } from './EditToolView';
import { CreateToolView } from './CreateToolView';
import { BashToolView } from './BashToolView';

export interface ToolViewProps {
  toolName: string;
  toolArgs: Record<string, unknown>;
  className?: string;
}

export const ToolView: React.FC<ToolViewProps> = ({ toolName, toolArgs, className }) => {
  if (toolName === 'edit') {
    return <EditToolView toolArgs={toolArgs} className={className} />;
  }

  if (toolName === 'create' || toolName === 'write') {
    return <CreateToolView toolArgs={toolArgs} className={className} />;
  }

  if (toolName === 'bash') {
    return <BashToolView toolArgs={toolArgs} className={className} />;
  }

  return (
    <section className={`w-full max-w-[832px] 2xl:max-w-5xl bg-card border border-border/50 rounded-xl shadow-xl p-4 ${className ?? ''}`.trim()}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm" aria-hidden="true">🧰</span>
        <span className="text-sm text-foreground/90">Unsupported tool:</span>
        <code className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{toolName || 'unknown'}</code>
      </div>
      <pre className="text-xs font-mono rounded-lg border border-border/50 bg-muted/30 p-3 overflow-auto whitespace-pre-wrap break-words">
        {JSON.stringify(toolArgs, null, 2)}
      </pre>
    </section>
  );
};
