/*
 * src/ai 공개 API. 여기 모듈은 순수하다(네트워크·타이머·window 없음). 외부 호출은 src/ai/providers에서만 한다.
 * AI 원문은 항상 normalize를 거친 뒤에만 엔진에 들어가고, 실패하면 rules로 대신한다(ADR-003).
 */
export { checkSensitive } from './safety';
export { normalizeInterpretation, normalizeVerdict } from './normalize';
export { ruleInterpret, rulesVerdict } from './rules';
export { buildInterpretPrompt, buildVerdictPrompt, evidenceToolResult, VERDICT_TOOL } from './prompts';
export type { VerdictToolSpec } from './prompts';
