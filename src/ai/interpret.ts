import type { Interpretation, PromptContext } from '../types/domain';
import { normalizeInterpretation } from './normalize';
import { AiError } from './providers/errors';
import type { AiProvider } from './providers/types';
import { ruleInterpret } from './rules';
import { checkSensitive } from './safety';

/*
 * TMI 한 줄 → Interpretation. 순수 흐름이다: 외부 호출은 넘겨받은 provider만 한다.
 * AI 원문은 항상 normalizeInterpretation을 거치고, 실패·오류·AI 없음이면 규칙 해석으로 대신한다(ADR-003).
 * 코드에서 재시도하지 않는다(ADR-006).
 */

/** TMI 한 줄의 최대 글자 수 */
export const MAX_TMI_LENGTH = 80;

export interface InterpretOutcome {
  interpretation: Interpretation;
  /** 대체 경로를 탔을 때 화면에 알릴 문구, 없으면 '' */
  note: string;
  /** true면 이 화면에서 provider를 더 쓰지 않는다 */
  disableProvider: boolean;
}

const NOTE = {
  unreadable: 'AI 응답을 읽지 못해 규칙으로 계산했어요.',
  unavailable: 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.',
  rateLimited: 'AI 호출 한도에 걸려 규칙으로 계산했어요. 잠시 뒤 다시 해 보세요.',
  timeout: 'AI 응답이 늦어 규칙으로 계산했어요.',
  failed: 'AI 해석에 실패해 규칙으로 계산했어요.',
} as const;

const AI_REFUSED_REASON = 'AI가 이 문장은 계산하지 않기로 했어요.';

/** 앞뒤 공백을 지우고 MAX_TMI_LENGTH 글자(코드 포인트)로 자른다 */
export function clipTmi(text: string): string {
  return Array.from(text.trim()).slice(0, MAX_TMI_LENGTH).join('').trim();
}

export async function interpretTmi(
  text: string,
  ctx: PromptContext,
  provider: AiProvider | null,
  opts: { measuredAvailable: boolean; signal?: AbortSignal },
): Promise<InterpretOutcome> {
  const clean = clipTmi(text);
  if (!clean) throw new Error('TMI 문장이 비어 있어요.');

  const sensitive = checkSensitive(clean);
  if (sensitive.blocked) {
    return { interpretation: { source: 'rules', refused: true, reason: sensitive.reason, comment: '', parts: [] }, note: '', disableProvider: false };
  }

  const rules = (note: string, disableProvider = false): InterpretOutcome => ({
    interpretation: ruleInterpret(clean, ctx, { measuredAvailable: opts.measuredAvailable }),
    note,
    disableProvider,
  });
  if (!provider) return rules('');

  let raw: unknown;
  try {
    raw = await provider.interpret({ text: clean, ctx, measuredAvailable: opts.measuredAvailable }, opts.signal);
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof AiError && e.code === 'cancelled')) throw e;
    if (!(e instanceof AiError)) return rules(NOTE.failed);
    switch (e.code) {
      case 'unavailable':
        return rules(NOTE.unavailable, e.permanent);
      case 'rate_limited':
        return rules(NOTE.rateLimited);
      case 'refused':
        return {
          interpretation: { source: 'ai', refused: true, reason: AI_REFUSED_REASON, comment: '', parts: [] },
          note: '',
          disableProvider: false,
        };
      case 'timeout':
        return rules(NOTE.timeout);
      case 'bad_response':
        return rules(NOTE.unreadable);
      default:
        return rules(NOTE.failed);
    }
  }

  const interpretation = normalizeInterpretation(raw);
  return interpretation ? { interpretation, note: '', disableProvider: false } : rules(NOTE.unreadable);
}
