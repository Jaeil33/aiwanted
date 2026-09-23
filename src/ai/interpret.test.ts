import { describe, expect, it, vi } from 'vitest';
import { interpretTmi } from './interpret';
import { normalizeInterpretation } from './normalize';
import { AiError } from './providers/errors';
import type { AiErrorCode, AiProvider, InterpretRequest } from './providers/types';
import { ruleInterpret } from './rules';
import { SENSITIVE_REASON } from './safety';
import { fixtureContext } from './test-helpers';

const ctx = fixtureContext();
const on = { measuredAvailable: true };
const TEXT = '원정투수가 경기 전 짜장면 곱빼기를 먹었다';

function fakeProvider(interpret: (req: InterpretRequest, signal?: AbortSignal) => Promise<unknown>) {
  const spy = vi.fn(interpret);
  const provider: AiProvider = { name: 'http', interpret: spy, verdict: vi.fn(async () => null) };
  return { provider, spy };
}

const failing = (error: unknown) => fakeProvider(() => Promise.reject(error)).provider;

describe('interpretTmi', () => {
  it('앞뒤 공백을 지우고 80자로 잘라 provider에 보낸다. 빈 문자열이면 Error', async () => {
    await expect(interpretTmi('   ', ctx, null, on)).rejects.toThrow(Error);
    const { provider, spy } = fakeProvider(async () => ({ comment: '', parts: [] }));
    await interpretTmi(`  ${'가'.repeat(100)}  `, ctx, provider, on);
    expect(spy).toHaveBeenCalledWith({ text: '가'.repeat(80), ctx, measuredAvailable: true }, undefined);
  });

  it('민감한 문장은 provider를 부르지 않고 규칙으로 거부한다', async () => {
    const { provider, spy } = fakeProvider(async () => ({}));
    await expect(interpretTmi('투수가 어젯밤 음주운전을 했다', ctx, provider, on)).resolves.toEqual({
      interpretation: { source: 'rules', refused: true, reason: SENSITIVE_REASON, comment: '', parts: [] },
      note: '',
      disableProvider: false,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('provider가 null이면 규칙 해석', async () => {
    await expect(interpretTmi(' 오늘 폭염 ', ctx, null, { measuredAvailable: false })).resolves.toEqual({
      interpretation: ruleInterpret('오늘 폭염', ctx, { measuredAvailable: false }),
      note: '',
      disableProvider: false,
    });
  });

  it('AI 응답은 normalize를 거쳐 source ai로 쓴다 (signal 전달)', async () => {
    const raw = {
      refused: false,
      comment: '곱빼기는 9회에 무겁죠',
      parts: [
        { kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -7, scope: 'game', evidence: 'fun', why: '배부름' },
        { kind: 'knob', knob: 'teleport', subject: 'pitcher', strength: 1 },
      ],
    };
    const { provider, spy } = fakeProvider(async () => raw);
    const controller = new AbortController();
    const out = await interpretTmi(TEXT, ctx, provider, { measuredAvailable: true, signal: controller.signal });
    expect(out).toEqual({ interpretation: normalizeInterpretation(raw), note: '', disableProvider: false });
    expect(out.interpretation).toMatchObject({ source: 'ai', parts: [{ knob: 'stamina', strength: -3 }] });
    expect(spy).toHaveBeenCalledWith({ text: TEXT, ctx, measuredAvailable: true }, controller.signal);
  });

  it('AI가 효과를 하나도 안 주면 규칙으로 대신한다 (ADR-013·ADR-026: 해석은 늘 무언가를 건다)', async () => {
    const { provider } = fakeProvider(async () => ({ refused: false, reason: '', comment: '그게 무슨 상관입니까.', parts: [] }));
    const out = await interpretTmi(TEXT, ctx, provider, on);
    expect(out).toEqual({
      interpretation: ruleInterpret(TEXT, ctx, on),
      note: 'AI가 효과를 찾지 못해 규칙으로 계산했어요.',
      disableProvider: false,
    });
    expect(out.interpretation.parts.length).toBeGreaterThan(0);
  });

  it('AI가 거부하면서 parts가 비어 있으면 그 거부를 그대로 쓴다', async () => {
    const { provider } = fakeProvider(async () => ({ refused: true, reason: '계산하지 않아요.', comment: '', parts: [] }));
    const out = await interpretTmi(TEXT, ctx, provider, on);
    expect(out.interpretation).toMatchObject({ source: 'ai', refused: true, parts: [] });
    expect(out.note).toBe('');
  });

  it('normalize에 실패하면 규칙 + "AI 응답을 읽지 못해 규칙으로 계산했어요."', async () => {
    const { provider } = fakeProvider(async () => 'not json object');
    await expect(interpretTmi(TEXT, ctx, provider, on)).resolves.toEqual({
      interpretation: ruleInterpret(TEXT, ctx, on),
      note: 'AI 응답을 읽지 못해 규칙으로 계산했어요.',
      disableProvider: false,
    });
  });

  const FALLBACKS: Array<[code: AiErrorCode, permanent: boolean, note: string, disableProvider: boolean]> = [
    ['unavailable', true, 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.', true],
    ['unavailable', false, 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.', false],
    ['rate_limited', false, 'AI 호출 한도에 걸려 규칙으로 계산했어요. 잠시 뒤 다시 해 보세요.', false],
    ['timeout', false, 'AI 응답이 늦어 규칙으로 계산했어요.', false],
    ['bad_response', false, 'AI 응답을 읽지 못해 규칙으로 계산했어요.', false],
    ['network', false, 'AI 해석에 실패해 규칙으로 계산했어요.', false],
    ['upstream', false, 'AI 해석에 실패해 규칙으로 계산했어요.', false],
    ['tools_unavailable', false, 'AI 해석에 실패해 규칙으로 계산했어요.', false],
  ];

  it.each(FALLBACKS)('AiError %s (permanent %s) → 규칙 + note', async (code, permanent, note, disableProvider) => {
    await expect(interpretTmi(TEXT, ctx, failing(new AiError(code, code, { permanent })), on)).resolves.toEqual({
      interpretation: ruleInterpret(TEXT, ctx, on),
      note,
      disableProvider,
    });
  });

  it('AiError가 아닌 예외도 규칙으로 대신한다', async () => {
    await expect(interpretTmi(TEXT, ctx, failing(new Error('bug')), on)).resolves.toMatchObject({
      interpretation: { source: 'rules' },
      note: 'AI 해석에 실패해 규칙으로 계산했어요.',
      disableProvider: false,
    });
  });

  it('AI가 거부하면 source ai 거부 해석', async () => {
    await expect(interpretTmi(TEXT, ctx, failing(new AiError('refused')), on)).resolves.toEqual({
      interpretation: { source: 'ai', refused: true, reason: 'AI가 이 문장은 계산하지 않기로 했어요.', comment: '', parts: [] },
      note: '',
      disableProvider: false,
    });
  });

  it('cancelled는 그대로 다시 던진다 (signal이 abort된 뒤의 다른 예외도)', async () => {
    const cancelled = new AiError('cancelled');
    await expect(interpretTmi(TEXT, ctx, failing(cancelled), on)).rejects.toBe(cancelled);
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException('aborted', 'AbortError');
    await expect(interpretTmi(TEXT, ctx, failing(abortError), { measuredAvailable: true, signal: controller.signal })).rejects.toBe(abortError);
  });
});
