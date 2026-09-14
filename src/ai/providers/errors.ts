import type { AiErrorCode } from './types';

/** 프로바이더 오류. code로 대체 경로를 고르고, permanent면 이 화면에서 프로바이더를 끈다 */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly permanent: boolean;

  constructor(code: AiErrorCode, message: string = code, opts: { permanent?: boolean } = {}) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.permanent = opts.permanent ?? false;
  }
}

/** 기능을 영구히 숨기는 sample 오류 코드 */
const HIDDEN_CODES: ReadonlySet<string> = new Set([
  'not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed',
]);

const SAMPLE_CODE_MAP: Readonly<Record<string, AiErrorCode>> = {
  session_expired: 'unavailable',
  tools_unavailable: 'tools_unavailable',
  rate_limited: 'rate_limited',
  refused: 'refused',
  invalid_json: 'bad_response',
  empty_completion: 'bad_response',
  cancelled: 'cancelled',
};

/**
 * 아티팩트 런타임 sample의 reject 값(평범한 객체 {code, message, text?})을 AiError로 바꾼다.
 * 모르는 코드는 upstream. 부분 답(text)은 옮기지 않는다.
 */
export function fromSampleError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const record = typeof e === 'object' && e !== null ? (e as { code?: unknown; message?: unknown }) : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const detail = typeof record.message === 'string' ? `: ${record.message.slice(0, 200)}` : '';
  const message = code ? `sample ${code}${detail}` : 'sample 호출 실패';
  if (HIDDEN_CODES.has(code)) return new AiError('unavailable', message, { permanent: true });
  return new AiError(Object.hasOwn(SAMPLE_CODE_MAP, code) ? SAMPLE_CODE_MAP[code] : 'upstream', message);
}
