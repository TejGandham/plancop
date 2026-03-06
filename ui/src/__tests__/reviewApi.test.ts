import { describe, it, expect, vi, afterEach } from 'vitest';
import { postApproveDecision, postDenyDecision } from '../App';
import { formatFeedback } from '../utils/feedback';
import { AnnotationType, type Annotation } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
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
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/approve');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['Authorization']).toMatch(/^Bearer /);
  });

  it('deny sends POST /api/deny with formatted feedback reason and auth header', async () => {
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
    const headers = requestInit.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toMatch(/^Bearer /);
    expect(JSON.parse(String(requestInit.body))).toEqual({ reason: expectedReason });
  });
});
