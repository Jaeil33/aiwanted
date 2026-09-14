import { describe, expect, it, vi } from 'vitest';
import type { Interpretation } from '../types/domain';
import { normalizeVerdict } from './normalize';
import { AiError } from './providers/errors';
import type { AiErrorCode, AiProvider, VerdictRequest } from './providers/types';
import { ruleInterpret, rulesVerdict } from './rules';
import { fixtureContext, fixtureEvidence } from './test-helpers';
import { judgeTmi } from './verdict';

const ctx = fixtureContext();
const evidence = fixtureEvidence();
const TEXT = '땡볕 낮 경기';
const interpretation = ruleInterpret(TEXT, ctx, { measuredAvailable: true });
const dayGame = evidence.items.find((item) => item.id === 'day_game')!;

function fakeProvider(verdict: (req: VerdictRequest, signal?: AbortSignal) => Promise<unknown>) {
  const spy = vi.fn(verdict);
  const provider: AiProvider = { name: 'artifact', interpret: vi.fn(async () => null), verdict: spy };
  return { provider, spy };
}

const failing = (error: unknown) => fakeProvider(() => Promise.reject(error)).provider;

describe('judgeTmi', () => {
  it('거부된 해석이면 provider를 부르지 않고 판정하지 않는다', async () => {
    const refused: Interpretation = { source: 'ai', refused: true, reason: 'AI가 이 문장은 계산하지 않기로 했어요.', comment: '', parts: [] };
    const { provider, spy } = fakeProvider(async () => ({}));
    await expect(judgeTmi(TEXT, refused, ctx, evidence, provider)).resolves.toEqual({
      verdict: { source: 'rules', variables: [], verdict: 'unmeasurable', headline: '판정하지 않는 문장이에요', body: refused.reason },
      note: '',
      disableProvider: false,
    });
    // 해석이 거부되지 않았어도 민감한 문장이면 같다
    await expect(judgeTmi('타자가 음주운전을 했다', interpretation, ctx, evidence, provider)).resolves.toMatchObject({
      verdict: { source: 'rules', verdict: 'unmeasurable', headline: '판정하지 않는 문장이에요' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('evidence나 provider가 null이면 규칙 판정', async () => {
    const { provider, spy } = fakeProvider(async () => ({}));
    await expect(judgeTmi(TEXT, interpretation, ctx, null, provider)).resolves.toEqual({
      verdict: rulesVerdict(TEXT, interpretation, null),
      note: '',
      disableProvider: false,
    });
    expect(spy).not.toHaveBeenCalled();
    await expect(judgeTmi(TEXT, interpretation, ctx, evidence, null)).resolves.toEqual({
      verdict: rulesVerdict(TEXT, interpretation, evidence),
      note: '',
      disableProvider: false,
    });
  });

  it('AI 판정은 normalizeVerdict를 거친다 (요청·signal 전달, 80자 자르기)', async () => {
    const raw = { variables: ['day_game'], verdict: 'useless', headline: '낮 경기는 핑계예요', body: '기록상 차이가 없어요.' };
    const { provider, spy } = fakeProvider(async () => raw);
    const controller = new AbortController();
    const out = await judgeTmi(`  ${TEXT}  `, interpretation, ctx, evidence, provider, controller.signal);
    expect(out).toEqual({ verdict: normalizeVerdict(raw, evidence), note: '', disableProvider: false });
    expect(out.verdict).toMatchObject({ source: 'ai', verdict: 'useless', headline: '낮 경기는 핑계예요' });
    expect(spy).toHaveBeenCalledWith({ text: TEXT, interpretation, ctx, evidence }, controller.signal);

    await judgeTmi('나'.repeat(100), interpretation, ctx, evidence, provider);
    expect(spy.mock.calls[1][0].text).toBe('나'.repeat(80));
  });

  it('AI가 evidence와 다른 판정을 말하면 evidence 판정으로 덮인다', async () => {
    const { provider } = fakeProvider(async () => ({ variables: ['day_game'], verdict: 'real', headline: '진짜 효과!', body: '낮 경기는 크게 불리해요.' }));
    const out = await judgeTmi(TEXT, interpretation, ctx, evidence, provider);
    expect(out.verdict).toEqual({ source: 'ai', variables: ['day_game'], verdict: 'useless', headline: '쓸모없는 변수로 판정됐어요', body: dayGame.note });
  });

  it('normalize에 실패하면 규칙 판정 + "AI 판정을 읽지 못해 기록표로 판정했어요."', async () => {
    const { provider } = fakeProvider(async () => 'nope');
    await expect(judgeTmi(TEXT, interpretation, ctx, evidence, provider)).resolves.toEqual({
      verdict: rulesVerdict(TEXT, interpretation, evidence),
      note: 'AI 판정을 읽지 못해 기록표로 판정했어요.',
      disableProvider: false,
    });
  });

  const FALLBACKS: Array<[code: AiErrorCode, permanent: boolean, note: string, disableProvider: boolean]> = [
    ['tools_unavailable', false, '이 화면에서는 AI 판정을 쓸 수 없어 기록표로 판정했어요.', false],
    ['unavailable', true, 'AI 판정을 쓸 수 없어 기록표로 판정했어요.', true],
    ['unavailable', false, 'AI 판정을 쓸 수 없어 기록표로 판정했어요.', false],
    ['rate_limited', false, 'AI 호출 한도에 걸려 기록표로 판정했어요. 잠시 뒤 다시 해 보세요.', false],
    ['timeout', false, 'AI 응답이 늦어 기록표로 판정했어요.', false],
    ['bad_response', false, 'AI 판정을 읽지 못해 기록표로 판정했어요.', false],
    ['network', false, 'AI 판정에 실패해 기록표로 판정했어요.', false],
    ['upstream', false, 'AI 판정에 실패해 기록표로 판정했어요.', false],
  ];

  it.each(FALLBACKS)('AiError %s (permanent %s) → 규칙 판정 + note', async (code, permanent, note, disableProvider) => {
    await expect(judgeTmi(TEXT, interpretation, ctx, evidence, failing(new AiError(code, code, { permanent })))).resolves.toEqual({
      verdict: rulesVerdict(TEXT, interpretation, evidence),
      note,
      disableProvider,
    });
  });

  it('AI가 판정을 거부하면 판정하지 않는 문장', async () => {
    await expect(judgeTmi(TEXT, interpretation, ctx, evidence, failing(new AiError('refused')))).resolves.toEqual({
      verdict: { source: 'ai', variables: [], verdict: 'unmeasurable', headline: '판정하지 않는 문장이에요', body: 'AI가 이 문장은 판정하지 않기로 했어요.' },
      note: '',
      disableProvider: false,
    });
  });

  it('cancelled는 그대로 다시 던진다', async () => {
    const cancelled = new AiError('cancelled');
    await expect(judgeTmi(TEXT, interpretation, ctx, evidence, failing(cancelled))).rejects.toBe(cancelled);
  });
});
