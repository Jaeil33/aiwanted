import type { EvidenceData } from '../types/data';
import type { Interpretation, PromptContext, VerdictResult } from '../types/domain';
import { clipTmi } from './interpret';
import { normalizeVerdict } from './normalize';
import { AiError } from './providers/errors';
import type { AiProvider } from './providers/types';
import { rulesVerdict } from './rules';
import { checkSensitive, SENSITIVE_REASON } from './safety';

/*
 * "진짜야?" 판정. AI는 도구(lookupEvidence)로 evidence 값만 조회해 설명하고,
 * 판정은 normalizeVerdict가 evidence item으로 덮어쓴다. 실패·오류·AI 없음이면 기록표(rulesVerdict)로 판정한다.
 */

export interface VerdictOutcome {
  verdict: VerdictResult;
  /** 대체 경로를 탔을 때 화면에 알릴 문구, 없으면 '' */
  note: string;
  /** true면 이 화면에서 provider를 더 쓰지 않는다 */
  disableProvider: boolean;
}

const REFUSED_HEADLINE = '판정하지 않는 문장이에요';
const AI_REFUSED_BODY = 'AI가 이 문장은 판정하지 않기로 했어요.';

const NOTE = {
  unreadable: 'AI 판정을 읽지 못해 기록표로 판정했어요.',
  toolsUnavailable: '이 화면에서는 AI 판정을 쓸 수 없어 기록표로 판정했어요.',
  unavailable: 'AI 판정을 쓸 수 없어 기록표로 판정했어요.',
  rateLimited: 'AI 호출 한도에 걸려 기록표로 판정했어요. 잠시 뒤 다시 해 보세요.',
  timeout: 'AI 응답이 늦어 기록표로 판정했어요.',
  failed: 'AI 판정에 실패해 기록표로 판정했어요.',
} as const;

export async function judgeTmi(
  text: string,
  interpretation: Interpretation,
  ctx: PromptContext,
  evidence: EvidenceData | null,
  provider: AiProvider | null,
  signal?: AbortSignal,
): Promise<VerdictOutcome> {
  const clean = clipTmi(text);
  const sensitive = checkSensitive(clean);
  if (interpretation.refused || sensitive.blocked) {
    return {
      verdict: {
        source: 'rules',
        variables: [],
        verdict: 'unmeasurable',
        headline: REFUSED_HEADLINE,
        body: interpretation.reason || sensitive.reason || SENSITIVE_REASON,
      },
      note: '',
      disableProvider: false,
    };
  }

  const rules = (note: string, disableProvider = false): VerdictOutcome => ({
    verdict: rulesVerdict(clean, interpretation, evidence),
    note,
    disableProvider,
  });
  if (!evidence || !provider) return rules('');

  let raw: unknown;
  try {
    raw = await provider.verdict({ text: clean, interpretation, ctx, evidence }, signal);
  } catch (e) {
    if (signal?.aborted || (e instanceof AiError && e.code === 'cancelled')) throw e;
    if (!(e instanceof AiError)) return rules(NOTE.failed);
    switch (e.code) {
      case 'tools_unavailable':
        return rules(NOTE.toolsUnavailable);
      case 'unavailable':
        return rules(NOTE.unavailable, e.permanent);
      case 'rate_limited':
        return rules(NOTE.rateLimited);
      case 'refused':
        return {
          verdict: { source: 'ai', variables: [], verdict: 'unmeasurable', headline: REFUSED_HEADLINE, body: AI_REFUSED_BODY },
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

  const verdict = normalizeVerdict(raw, evidence);
  return verdict ? { verdict, note: '', disableProvider: false } : rules(NOTE.unreadable);
}
