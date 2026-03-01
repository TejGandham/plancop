import { describe, it, expect, vi } from 'vitest';
import { compress, decompress, parseShareHash, type SharePayload } from '../sharing';

describe('sharing round-trip', () => {
  it('round-trips payload', async () => {
    const payload: SharePayload = {
      p: '# Plan\n\nHello',
      a: [['C', 'Hello', 'comment', 'alice']],
      g: [['/uploads/x.png', 'x']],
    };
    const hash = await compress(payload);
    const decoded = await decompress(hash);
    expect(decoded).toEqual(payload);
  });

  it('round-trips empty annotations', async () => {
    const payload: SharePayload = { p: '# Empty', a: [] };
    const hash = await compress(payload);
    await expect(decompress(hash)).resolves.toEqual(payload);
  });

  it('round-trips large payload (>10KB)', async () => {
    const large = 'A'.repeat(12 * 1024);
    const payload: SharePayload = {
      p: `# Big\n\n${large}`,
      a: [['C', large.slice(0, 64), 'ok', 'bot']],
    };
    const hash = await compress(payload);
    const decoded = await decompress(hash);
    expect(decoded).toEqual(payload);
  });

  it('handles invalid hash', async () => {
    await expect(decompress('not-valid-@@@')).rejects.toBeTruthy();

    const original = window.location.hash;
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hash: '#not-valid-@@@' },
    });
    await expect(parseShareHash()).resolves.toBeNull();
    window.location.hash = original;
  });
});
