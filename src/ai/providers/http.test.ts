// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ruleInterpret } from '../rules';
import { fixtureContext, fixtureEvidence } from '../test-helpers';
import { AiError } from './errors';
import { createHttpProvider } from './http';
import type { InterpretRequest, VerdictRequest } from './types';

const ctx = fixtureContext();
const interpretReq: InterpretRequest = { text: '오늘 폭염', ctx, measuredAvailable: true };
const verdictReq: VerdictRequest = {
  text: '오늘 폭염',
  interpretation: ruleInterpret('오늘 폭염', ctx, { measuredAvailable: true }),
  ctx,
  evidence: fixtureEvidence(),
};

interface Call {
  url: string;
  init: RequestInit;
}

/** 호출을 기록하는 가짜 fetch. 브라우저 fetch처럼 다른 객체의 메서드로 부르면 Illegal invocation으로 실패한다 */
function fakeFetch(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetchImpl = function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this !== undefined && this !== globalThis) return Promise.reject(new TypeError('Illegal invocation'));
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return Promise.resolve().then(() => respond(call));
  } as typeof fetch;
  return { fetchImpl, calls };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** 요청 signal이 abort되면 실제 fetch처럼 AbortError로 reject하고, 아니면 끝나지 않는다 */
function hang(call: Call): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = call.init.signal;
    if (!signal) return;
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

/** 끝났는지 들여다볼 수 있게 promise를 감싼다 */
function track(p: Promise<unknown>) {
  const state = { settled: false };
  p.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createHttpProvider', () => {
  it('interpret: POST {baseUrl}/interpret, JSON 본문은 InterpretRequest, 200 {raw} → raw', async () => {
    const raw = { comment: '원문 그대로', parts: [{ kind: 'teleport' }] };
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, { raw }));
    const provider = createHttpProvider({ baseUrl: '/api', fetch: fetchImpl });
    expect(provider.name).toBe('http');
    await expect(provider.interpret(interpretReq)).resolves.toEqual(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/interpret');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(calls[0].init.body))).toEqual(interpretReq);
  });

  it('verdict: POST {baseUrl}/verdict, 본문은 VerdictRequest, baseUrl 끝의 /는 떼어 낸다', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, { raw: { variables: [] } }));
    const provider = createHttpProvider({ baseUrl: 'https://tmi.example/api/', fetch: fetchImpl });
    await expect(provider.verdict(verdictReq)).resolves.toEqual({ variables: [] });
    expect(calls[0].url).toBe('https://tmi.example/api/verdict');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(verdictReq);
    await expect(createHttpProvider({ baseUrl: '/api', fetch: fakeFetch(() => jsonResponse(200, { raw: null })).fetchImpl }).verdict(verdictReq)).resolves.toBeNull();
  });

  const STATUS: Array<[status: number, code: string, permanent: boolean]> = [
    [429, 'rate_limited', false],
    [503, 'unavailable', true],
    [502, 'upstream', false],
    [500, 'upstream', false],
    [400, 'upstream', false],
    [413, 'upstream', false],
  ];

  it.each(STATUS)('HTTP %i → %s (permanent %s), 재시도하지 않는다', async (status, code, permanent) => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(status, { error: 'nope' }));
    const provider = createHttpProvider({ baseUrl: '/api', fetch: fetchImpl });
    for (const run of [() => provider.interpret(interpretReq), () => provider.verdict(verdictReq)]) {
      const error = await errorOf(run());
      expect(error).toBeInstanceOf(AiError);
      expect(error).toMatchObject({ code, permanent });
    }
    expect(calls).toHaveLength(2);
  });

  it('200인데 {raw} 모양이 아니거나 JSON이 아니면 bad_response', async () => {
    const responses = [() => jsonResponse(200, { nope: 1 }), () => jsonResponse(200, [1]), () => new Response('not json', { status: 200 })];
    for (const respond of responses) {
      const { fetchImpl } = fakeFetch(respond);
      const error = await errorOf(createHttpProvider({ baseUrl: '/api', fetch: fetchImpl }).interpret(interpretReq));
      expect(error).toMatchObject({ code: 'bad_response' });
    }
  });

  it('fetch 예외 → network', async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await errorOf(createHttpProvider({ baseUrl: '/api', fetch: fetchImpl }).interpret(interpretReq));
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: 'network' });
  });

  it('제한 시간: 해석 기본 8초, 판정 기본 60초를 넘으면 timeout이고 요청을 abort한다', async () => {
    vi.useFakeTimers();
    const { fetchImpl, calls } = fakeFetch(hang);
    const provider = createHttpProvider({ baseUrl: '/api', fetch: fetchImpl });

    const interpret = provider.interpret(interpretReq);
    const interpretState = track(interpret);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(interpretState.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await errorOf(interpret)).toMatchObject({ code: 'timeout' });
    expect(calls[0].init.signal?.aborted).toBe(true);

    const verdict = provider.verdict(verdictReq);
    const verdictState = track(verdict);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(verdictState.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await errorOf(verdict)).toMatchObject({ code: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('제한 시간은 옵션으로 바꿀 수 있고, 응답이 오면 타이머를 지운다', async () => {
    vi.useFakeTimers();
    const slow = fakeFetch(hang);
    const provider = createHttpProvider({ baseUrl: '/api', fetch: slow.fetchImpl, interpretTimeoutMs: 100, verdictTimeoutMs: 200 });
    const interpret = errorOf(provider.interpret(interpretReq));
    const verdict = errorOf(provider.verdict(verdictReq));
    await vi.advanceTimersByTimeAsync(200);
    expect(await interpret).toMatchObject({ code: 'timeout' });
    expect(await verdict).toMatchObject({ code: 'timeout' });

    const fast = fakeFetch(() => jsonResponse(200, { raw: {} }));
    await createHttpProvider({ baseUrl: '/api', fetch: fast.fetchImpl }).interpret(interpretReq);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('외부 signal이 abort되면 cancelled, 이미 abort된 signal이면 fetch를 부르지 않는다', async () => {
    const { fetchImpl, calls } = fakeFetch(hang);
    const provider = createHttpProvider({ baseUrl: '/api', fetch: fetchImpl });
    const controller = new AbortController();
    const pending = errorOf(provider.interpret(interpretReq, controller.signal));
    controller.abort();
    expect(await pending).toMatchObject({ code: 'cancelled' });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal?.aborted).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    expect(await errorOf(provider.verdict(verdictReq, aborted.signal))).toMatchObject({ code: 'cancelled' });
    expect(calls).toHaveLength(1);
  });
});
