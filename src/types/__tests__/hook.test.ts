import { describe, it, expect } from 'vitest';
import { isValidPreToolUseInput } from '../hook.js';

describe('isValidPreToolUseInput', () => {
  it('accepts valid hook input', () => {
    expect(isValidPreToolUseInput({
      timestamp: 1704614600000,
      cwd: '/home/user/project',
      toolName: 'edit',
      toolArgs: '{"file":"src/app.ts","old_string":"foo","new_string":"bar"}'
    })).toBe(true);
  });

  it('rejects missing timestamp', () => {
    expect(isValidPreToolUseInput({ cwd: '/tmp', toolName: 'edit', toolArgs: '{}' })).toBe(false);
  });

  it('rejects missing cwd', () => {
    expect(isValidPreToolUseInput({ timestamp: 0, toolName: 'edit', toolArgs: '{}' })).toBe(false);
  });

  it('rejects toolArgs as object (must be string — double-parse gotcha)', () => {
    expect(isValidPreToolUseInput({
      timestamp: 0, cwd: '/tmp', toolName: 'edit',
      toolArgs: { file: 'foo' }  // WRONG: object instead of JSON string
    })).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidPreToolUseInput(null)).toBe(false);
  });

  it('rejects empty object', () => {
    expect(isValidPreToolUseInput({})).toBe(false);
  });
});
