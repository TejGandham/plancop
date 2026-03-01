import React from 'react';

interface BashToolViewProps {
  toolArgs: Record<string, unknown>;
  className?: string;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/(sd[a-z]|nvme\d+n\d+)/i,
  /:\s*\(\)\s*\{\s*:\|:&\s*\};:/,
];

function getCommand(toolArgs: Record<string, unknown>): string {
  const command = toolArgs.command;
  if (typeof command === 'string') {
    return command;
  }

  const cmd = toolArgs.cmd;
  if (typeof cmd === 'string') {
    return cmd;
  }

  return '';
}

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

export const BashToolView: React.FC<BashToolViewProps> = ({ toolArgs, className = '' }) => {
  const command = getCommand(toolArgs) || '(empty command)';
  const isDangerous = isDangerousCommand(command);

  return (
    <section className={`w-full max-w-[832px] 2xl:max-w-5xl bg-card border border-border/50 rounded-xl shadow-xl ${className}`.trim()}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-yellow-500/30 bg-yellow-500/10 rounded-t-xl">
        <span className="text-xs md:text-sm text-yellow-200 font-medium">⚠️ This bash command will be executed</span>
        {isDangerous && (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-300 border border-red-500/40">DANGER</span>
        )}
      </header>

      <div className="p-4 bg-zinc-900 rounded-b-xl">
        <pre className="text-green-400 font-mono text-xs md:text-sm leading-6 overflow-auto whitespace-pre-wrap break-words bg-zinc-900">{command}</pre>
      </div>
    </section>
  );
};
