import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from './ThemeProvider';
import { getAutoCloseDelay, setAutoCloseDelay, AUTO_CLOSE_OPTIONS, type AutoCloseDelay } from '../utils/storage';
import { getEditorMode, saveEditorMode } from '../utils/editorMode';
import { getUIPreferences, saveUIPreferences, type UIPreferences } from '../utils/uiPreferences';

interface SettingsProps {
  onUIPreferencesChange?: (prefs: UIPreferences) => void;
}

export const Settings: React.FC<SettingsProps> = ({ onUIPreferencesChange }) => {
  const [showDialog, setShowDialog] = useState(false);
  const { theme, setTheme } = useTheme();
  const [autoCloseDelay, setAutoCloseDelayState] = useState<AutoCloseDelay>('off');
  const [editorMode, setEditorModeState] = useState<'selection' | 'comment' | 'redline'>('selection');
  const [uiPrefs, setUiPrefs] = useState<UIPreferences>({ tocEnabled: true, stickyActionsEnabled: true });

  useEffect(() => {
    if (showDialog) {
      setAutoCloseDelayState(getAutoCloseDelay());
      setEditorModeState(getEditorMode());
      setUiPrefs(getUIPreferences());
    }
  }, [showDialog]);

  const handleUIPrefsChange = (updates: Partial<UIPreferences>) => {
    const newPrefs = { ...uiPrefs, ...updates };
    setUiPrefs(newPrefs);
    saveUIPreferences(newPrefs);
    onUIPreferencesChange?.(newPrefs);
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Settings"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {showDialog && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-sm">Settings</h3>
              <button
                onClick={() => setShowDialog(false)}
                className="p-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">

              {/* Auto-close Tab */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Auto-close Tab</div>
                <select
                  value={autoCloseDelay}
                  onChange={(e) => {
                    const next = e.target.value as AutoCloseDelay;
                    setAutoCloseDelayState(next);
                    setAutoCloseDelay(next);
                  }}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                >
                  {AUTO_CLOSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-muted-foreground/70">
                  {AUTO_CLOSE_OPTIONS.find(o => o.value === autoCloseDelay)?.description}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Theme */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Theme</div>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div className="border-t border-border" />

              {/* Editor Mode Default */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Editor Mode Default</div>
                <select
                  value={editorMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'selection' | 'comment' | 'redline';
                    setEditorModeState(mode);
                    saveEditorMode(mode);
                  }}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                >
                  <option value="selection">Selection</option>
                  <option value="comment">Comment</option>
                  <option value="redline">Redline</option>
                </select>
                <div className="text-[10px] text-muted-foreground/70">
                  Default annotation mode when opening the editor
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Auto-open Sidebar */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Auto-open Sidebar</div>
                  <div className="text-xs text-muted-foreground">
                    Open sidebar with Table of Contents on load
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={uiPrefs.tocEnabled}
                  onClick={() => handleUIPrefsChange({ tocEnabled: !uiPrefs.tocEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    uiPrefs.tocEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      uiPrefs.tocEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-border" />

              {/* Sticky Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Sticky Actions</div>
                  <div className="text-xs text-muted-foreground">
                    Keep action buttons visible while scrolling
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={uiPrefs.stickyActionsEnabled}
                  onClick={() => handleUIPrefsChange({ stickyActionsEnabled: !uiPrefs.stickyActionsEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    uiPrefs.stickyActionsEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      uiPrefs.stickyActionsEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
