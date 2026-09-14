import { AiError } from './errors';
import type { AiProvider } from './types';

export interface HttpProviderOptions {
  /** 서버리스 함수 경로의 앞부분. 예: "/api" */
  baseUrl: string;
  fetch: typeof fetch;
  interpretTimeoutMs?: number;
  verdictTimeoutMs?: number;
}

const DEFAULT_INTERPRET_TIMEOUT_MS = 8_000;
const DEFAULT_VERDICT_TIMEOUT_MS = 60_000;

/*
 * 배포 프로바이더(ADR-006): api/interpret·api/verdict에 구조화된 요청을 보내고 {raw}를 받는다.
 * 제한 시간(해석 8초·판정 60초)을 넘으면 timeout으로 끝내고, 코드에서 재시도하지 않는다.
 */
export function createHttpProvider(opts: HttpProviderOptions): AiProvider {
  const base = opts.baseUrl.replace(/\/+$/, '');
  // 브라우저 fetch는 다른 객체의 메서드로 부르면 Illegal invocation이다: 떼어 낸 함수로 부른다.
  const fetchImpl = opts.fetch;

  async function post(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new AiError('cancelled', 'AI 요청이 취소됐어요.');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    /** 요청이 중간에 끊겼으면 끊긴 이유(제한 시간·취소)가 먼저다 */
    const interrupted = (otherwise: AiError): AiError => {
      if (timedOut) return new AiError('timeout', `AI 응답이 ${timeoutMs}ms 안에 오지 않았어요.`);
      if (signal?.aborted) return new AiError('cancelled', 'AI 요청이 취소됐어요.');
      return otherwise;
    };

    try {
      let response: Response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        throw interrupted(new AiError('network', 'AI 서버에 연결하지 못했어요.'));
      }
      if (response.status === 429) throw new AiError('rate_limited', 'AI 호출 한도를 넘었어요.');
      if (response.status === 503) throw new AiError('unavailable', 'AI 서버를 쓸 수 없어요.', { permanent: true });
      if (!response.ok) throw new AiError('upstream', `AI 서버 오류 (HTTP ${response.status})`);
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw interrupted(new AiError('bad_response', 'AI 서버 응답이 JSON이 아니에요.'));
      }
      if (typeof data !== 'object' || data === null || Array.isArray(data) || !('raw' in data)) {
        throw new AiError('bad_response', 'AI 서버 응답에 raw가 없어요.');
      }
      return (data as { raw: unknown }).raw;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    name: 'http',
    interpret(req, signal) {
      return post('/interpret', req, opts.interpretTimeoutMs ?? DEFAULT_INTERPRET_TIMEOUT_MS, signal);
    },
    verdict(req, signal) {
      return post('/verdict', req, opts.verdictTimeoutMs ?? DEFAULT_VERDICT_TIMEOUT_MS, signal);
    },
  };
}
