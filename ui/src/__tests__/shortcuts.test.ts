import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Test the keyboard event handler logic directly
describe('Keyboard Shortcuts', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to create and test keyboard event handlers
  const createKeyboardHandler = (config: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
  }) => {
    return (e: KeyboardEvent) => {
      // Only handle specific key combinations
      if (config.key === 'Enter') {
        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
        if (config.shiftKey && !e.shiftKey) return;
        if (!config.shiftKey && e.shiftKey) return;
      } else if (config.key === 'Escape') {
        if (e.key !== 'Escape') return;
      }

      // Don't intercept if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
    };
  };

  describe('Cmd/Ctrl+Enter (Approve)', () => {
    it('should prevent default when Cmd+Enter is pressed', () => {
      const handler = createKeyboardHandler({ key: 'Enter' });
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent default when Ctrl+Enter is pressed', () => {
      const handler = createKeyboardHandler({ key: 'Enter' });
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not trigger if typing in input field', () => {
      const handler = createKeyboardHandler({ key: 'Enter' });
      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      });

      Object.defineProperty(event, 'target', { value: input, enumerable: true });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('should not trigger if typing in textarea', () => {
      const handler = createKeyboardHandler({ key: 'Enter' });
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      });

      Object.defineProperty(event, 'target', { value: textarea, enumerable: true });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('should not trigger if key is not Enter', () => {
      const handler = createKeyboardHandler({ key: 'Enter' });
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        metaKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not trigger if neither metaKey nor ctrlKey is pressed', () => {
      const handler = createKeyboardHandler({ key: 'Enter' });
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('Cmd/Ctrl+Shift+Enter (Deny/Send Feedback)', () => {
    it('should prevent default when Cmd+Shift+Enter is pressed', () => {
      const handler = createKeyboardHandler({ key: 'Enter', shiftKey: true });
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent default when Ctrl+Shift+Enter is pressed', () => {
      const handler = createKeyboardHandler({ key: 'Enter', shiftKey: true });
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not trigger without shift key', () => {
      const handler = createKeyboardHandler({ key: 'Enter', shiftKey: true });
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not trigger if typing in input field', () => {
      const handler = createKeyboardHandler({ key: 'Enter', shiftKey: true });
      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });

      Object.defineProperty(event, 'target', { value: input, enumerable: true });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('should not trigger if typing in textarea', () => {
      const handler = createKeyboardHandler({ key: 'Enter', shiftKey: true });
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });

      Object.defineProperty(event, 'target', { value: textarea, enumerable: true });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });
  });

  describe('Escape (Cancel/Close Modals)', () => {
    it('should prevent default on Escape key', () => {
      const handler = createKeyboardHandler({ key: 'Escape' });
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not prevent default for other keys', () => {
      const handler = createKeyboardHandler({ key: 'Escape' });
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      handler(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });


  describe('Keyboard Event Handler Logic', () => {
    it('should correctly identify Cmd+Enter vs Cmd+Shift+Enter', () => {
      const approveHandler = createKeyboardHandler({ key: 'Enter' });
      const denyHandler = createKeyboardHandler({ key: 'Enter', shiftKey: true });

      const approveEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      });

      const denyEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });

      const approveSpy = vi.spyOn(approveEvent, 'preventDefault');
      const denySpy = vi.spyOn(denyEvent, 'preventDefault');

      approveHandler(approveEvent);
      denyHandler(denyEvent);

      expect(approveSpy).toHaveBeenCalled();
      expect(denySpy).toHaveBeenCalled();
    });

  });
});
