import type { CallFacts, CallResult } from '../types/domain';
import { normalizeCall } from './normalize';
import { AiError } from './providers/errors';
import type { AiProvider } from './providers/types';
import { rulesCall } from './rules';

/*
 * 끝난 타석 하나 → 중계 해설 자막 한 줄(23-commentary).
 * 해석·판정과 같은 골격이다: 외부 호출은 넘겨받은 provider만 하고, AI 원문은 normalizeCall을 거치며,
 * 실패·오류·AI 없음이면 규칙 자막으로 대신한다(ADR-003). 코드에서 재시도하지 않는다(ADR-006).
 */

export interface CallOutcome extends CallResult {
  /** true면 이 화면에서 provider를 더 쓰지 않는다 */
  disableProvider: boolean;
}

export async function narratePa(facts: CallFacts, provider: AiProvider | null, signal?: AbortSignal): Promise<CallOutcome> {
  const rules = (disableProvider = false): CallOutcome => ({ source: 'rules', line: rulesCall(facts), disableProvider });
  // 자막의 재료는 걸린 TMI다. 없으면 부를 것이 없어 AI를 아끼고 규칙 자막으로 끝낸다
  if (!provider || facts.tmis.length === 0) return rules();

  let raw: unknown;
  try {
    raw = await provider.call({ facts }, signal);
  } catch (e) {
    if (signal?.aborted || (e instanceof AiError && e.code === 'cancelled')) throw e;
    /*
     * 자막은 곁들이는 줄이라 실패를 알리지 않는다: 해석·판정처럼 note를 띄우면
     * 화면 하나에 알림이 셋이 된다. 조용히 규칙 자막으로 바꾼다.
     */
    return rules(e instanceof AiError && e.code === 'unavailable' && e.permanent);
  }

  const line = normalizeCall(raw);
  return line === null ? rules() : { source: 'ai', line, disableProvider: false };
}
