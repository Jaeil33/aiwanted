import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInterpretPrompt, buildVerdictPrompt, evidenceToolResult, VERDICT_TOOL } from '../prompts';
import { ruleInterpret } from '../rules';
import { fixtureContext, fixtureEvidence } from '../test-helpers';
import { createArtifactProvider, resolveArtifactSample } from './artifact';
import type { SampleLike } from './artifact';
import { AiError } from './errors';
import type { InterpretRequest, VerdictRequest } from './types';

const ctx = fixtureContext();
const evidence = fixtureEvidence();
const interpretReq: InterpretRequest = { text: '원정투수가 경기 전 짜장면 곱빼기를 먹었다', ctx, measuredAvailable: true };
const verdictReq: VerdictRequest = {
  text: '오늘 폭염',
  interpretation: ruleInterpret('오늘 폭염', ctx, { measuredAvailable: true }),
  ctx,
  evidence,
};

type Answer = (input: string, options?: Record<string, unknown>) => Promise<unknown>;
type ToolLike = {
  name: string;
  description: string;
  inputSchema: unknown;
  execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
};

/** 호출을 기록하는 가짜 sample. 플랫폼 네임스페이스처럼 얼려 두고, 메서드로 부를 때만 답한다 */
function fakeSample(answer: Answer) {
  const calls: Array<{ input: string; options?: Record<string, unknown> }> = [];
  const sample: SampleLike = {
    json(this: unknown, input: string, options?: Record<string, unknown>) {
      calls.push({ input, options });
      if (this !== sample) return Promise.reject({ code: 'invalid_request', message: 'json called without its namespace' });
      return answer(input, options);
    },
  };
  return { sample: Object.freeze(sample), calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createArtifactProvider', () => {
  it('interpret: quick tier로 해석 프롬프트(사용자 문장 포함)를 보내고 원문을 그대로 돌려준다', async () => {
    const raw = { comment: '원문 그대로', parts: [{ kind: 'teleport' }] };
    const { sample, calls } = fakeSample(async () => raw);
    const provider = createArtifactProvider(sample);
    expect(provider.name).toBe('artifact');
    await expect(provider.interpret(interpretReq)).resolves.toBe(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(buildInterpretPrompt(interpretReq.text, ctx, { measuredAvailable: true }));
    expect(calls[0].input).toContain(JSON.stringify(interpretReq.text));
    expect(calls[0].options).toEqual({ modelTier: 'quick' });
  });

  it('signal을 넘기면 옵션에 싣는다', async () => {
    const { sample, calls } = fakeSample(async () => ({}));
    const controller = new AbortController();
    await createArtifactProvider(sample).interpret({ ...interpretReq, measuredAvailable: false }, controller.signal);
    expect(calls[0].input).toBe(buildInterpretPrompt(interpretReq.text, ctx, { measuredAvailable: false }));
    expect(calls[0].options).toEqual({ modelTier: 'quick', signal: controller.signal });
  });

  it('verdict: default tier, lookupEvidence 도구, cache 옵션 없음, execute는 evidence 요약', async () => {
    const { sample, calls } = fakeSample(async () => ({ variables: ['temp_c'] }));
    const controller = new AbortController();
    await expect(createArtifactProvider(sample).verdict(verdictReq, controller.signal)).resolves.toEqual({ variables: ['temp_c'] });
    expect(calls).toHaveLength(1);
    const { input, options } = calls[0];
    expect(input).toBe(buildVerdictPrompt(verdictReq.text, verdictReq.interpretation, ctx));
    expect(options).toMatchObject({ modelTier: 'default', signal: controller.signal });
    expect(options).not.toHaveProperty('cache');

    const tools = options?.tools as ToolLike[];
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: 'lookupEvidence', description: VERDICT_TOOL.description, inputSchema: VERDICT_TOOL.inputSchema });
    expect(new TextEncoder().encode(tools[0].description).length).toBeLessThanOrEqual(1024);
    const context = { signal: new AbortController().signal };
    expect(tools[0].execute({ variable: 'temp_c' }, context)).toEqual(evidenceToolResult(evidence, 'temp_c'));
    expect(tools[0].execute({ variable: 'humidity' }, context)).toMatchObject({ error: expect.any(String) });
    expect(JSON.stringify(tools[0].execute({ variable: 'day_game' }, context)).length).toBeLessThan(32 * 1024);
  });

  it('페이지 쪽 제한 시간이 없다: 동의를 기다리는 동안 타이머를 걸지 않는다', async () => {
    vi.useFakeTimers();
    const { sample } = fakeSample(() => new Promise<unknown>(() => {}));
    const provider = createArtifactProvider(sample);
    let settled = false;
    const finish = () => {
      settled = true;
    };
    provider.interpret(interpretReq).then(finish, finish);
    provider.verdict(verdictReq).then(finish, finish);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(settled).toBe(false);
  });

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
    ['image_rejected', 'upstream', false],
    ['cancelled', 'cancelled', false],
    ['upstream_error', 'upstream', false],
    ['never_seen_before', 'upstream', false],
  ];

  it.each(SAMPLE_ERRORS)('sample 오류 %s → AiError %s (permanent %s)', async (code, expected, permanent) => {
    const { sample } = fakeSample(() => Promise.reject({ code, message: 'sample failed', text: '부분 답' }));
    const provider = createArtifactProvider(sample);
    for (const run of [() => provider.interpret(interpretReq), () => provider.verdict(verdictReq)]) {
      const error = await run().then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(AiError);
      expect(error).toMatchObject({ code: expected, permanent });
    }
  });
});

describe('resolveArtifactSample', () => {
  it('win·claude·use가 없으면 곧바로 null', async () => {
    for (const win of [undefined, null, {}, { claude: undefined }, { claude: {} }, { claude: { use: null } }, { claude: { use: 'sample' } }]) {
      await expect(resolveArtifactSample(win)).resolves.toBeNull();
    }
  });

  it('use가 null을 주거나 reject·throw하거나 json 함수가 없으면 null', async () => {
    const uses: Array<(name: string) => Promise<unknown>> = [
      async () => null,
      () => Promise.reject({ code: 'not_granted', message: 'no' }),
      () => {
        throw new Error('boom');
      },
      async () => ({ json: 'not a function' }),
      async () => async () => ({ text: '', truncated: false }),
    ];
    for (const use of uses) {
      await expect(resolveArtifactSample({ claude: { use } })).resolves.toBeNull();
    }
  });

  it('정상: claude.use("sample")을 메서드로 불러 json을 가진 sample 함수를 돌려준다', async () => {
    const sample = Object.freeze(Object.assign(async () => ({ text: '', truncated: false }), { json: async () => ({}) }));
    const names: string[] = [];
    const claude: { use(name: string): Promise<unknown> } = {
      use(name: string) {
        names.push(name);
        return Promise.resolve(this === claude ? sample : null);
      },
    };
    await expect(resolveArtifactSample({ claude })).resolves.toBe(sample);
    expect(names).toEqual(['sample']);
  });
});
