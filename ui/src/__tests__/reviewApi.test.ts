import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postApproveDecision, postDenyDecision } from '../App';
import { formatFeedback } from '../utils/feedback';
import { AnnotationType, type Annotation } from '../types';

beforeEach(() => {
  (window as Record<string, unknown>).__PLANCOP_TOKEN__ = 'test-token-123';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as Record<string, unknown>).__PLANCOP_TOKEN__;
});

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    blockId: 'block-1',
    startOffset: 4,
    endOffset: 6,
    type: AnnotationType.COMMENT,
    originalText: 'Original plan text',
    text: 'Needs revision',
    createdA: Date.now(),
    ...overrides,
  };
}

describe('review API wiring', () => {
  it('approve sends POST /api/approve with auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    await postApproveDecision(fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/approve', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-token-123' },
    });
  });

  it('deny sends POST /api/deny with auth header and formatted feedback reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const annotations: Annotation[] = [
      makeAnnotation({
        type: AnnotationType.REPLACEMENT,
        originalText: 'old section',
        text: 'new section',
      }),
    ];
    const expectedReason = formatFeedback(annotations, []);

    const actualReason = await postDenyDecision(annotations, fetchMock as unknown as typeof fetch);

    expect(actualReason).toBe(expectedReason);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/deny');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers).toEqual({
      'Authorization': 'Bearer test-token-123',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(requestInit.body))).toEqual({ reason: expectedReason });
  });
});
