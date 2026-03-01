import React from 'react';

export const LoadingScreen: React.FC = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
    <div className="relative">
      <div className="w-10 h-10 border-[3px] border-border rounded-full" />
      <div className="absolute inset-0 w-10 h-10 border-[3px] border-transparent border-t-primary rounded-full animate-spin" />
    </div>
    <p className="text-sm text-muted-foreground font-medium animate-pulse">
      Loading plan…
    </p>
  </div>
);

export const ErrorScreen: React.FC<{ message?: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
    <div className="max-w-sm text-center space-y-4">
      <div className="text-4xl">⚡</div>
      <h1 className="text-lg font-semibold">Unable to connect</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {message || 'Could not reach the plan server. Make sure the coding agent is running.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      )}
    </div>
  </div>
);
