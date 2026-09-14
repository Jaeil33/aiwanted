import { describe, expect, it } from 'vitest';
import { AiError, fromSampleError } from './errors';

describe('AiError', () => {
  it('Error를 상속하고 code·permanent를 가진다', () => {
    const e = new AiError('timeout', '응답이 늦어요');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AiError);
    expect(e).toMatchObject({ name: 'AiError', code: 'timeout', permanent: false, message: '응답이 늦어요' });
    expect(new AiError('unavailable', '숨김', { permanent: true }).permanent).toBe(true);
    expect(new AiError('network').message).toBe('network');
  });
});

/** [sample 오류 코드, AiError code, permanent] — 아티팩트 런타임 sample 계약의 코드 묶음 */
const SAMPLE_ERRORS: Array<[code: string, expected: string, permanent: boolean]> = [
  ['not_granted', 'unavailable', true],
  ['sampling_disabled', 'unavailable', true],
  ['not_declared', 'unavailable', true],
  ['capability_disabled', 'unavailable', true],
  ['capability_removed', 'unavailable', true],
  ['session_expired', 'unavailable', false],
  ['tools_unavailable', 'tools_unavailable', false],
  ['rate_limited', 'rate_limited', false],
  ['refused', 'refused', false],
  ['invalid_json', 'bad_response', false],
  ['empty_completion', 'bad_response', false],
  ['cancelled', 'cancelled', false],
  ['image_rejected', 'upstream', false],
  ['upstream_error', 'upstream', false],
  ['invalid_request', 'upstream', false],
  ['prompt_too_large', 'upstream', false],
  ['brand_new_code', 'upstream', false],
];

describe('fromSampleError', () => {
  it.each(SAMPLE_ERRORS)('sample %s → %s (permanent %s)', (code, expected, permanent) => {
    const e = fromSampleError({ code, message: `sample failed: ${code}`, text: '부분 답' });
    expect(e).toBeInstanceOf(AiError);
    expect(e.code).toBe(expected);
    expect(e.permanent).toBe(permanent);
    expect(e.message).not.toContain('부분 답');
  });

  it('평범한 객체가 아니거나 code가 없으면 upstream', () => {
    for (const value of [undefined, null, 'boom', 42, new Error('boom'), { message: 'no code' }, { code: 7 }]) {
      expect(fromSampleError(value)).toMatchObject({ code: 'upstream', permanent: false });
    }
  });

  it('이미 AiError면 그대로 돌려준다', () => {
    const e = new AiError('timeout');
    expect(fromSampleError(e)).toBe(e);
  });
});
