/*
 * src/ai 공개 API. providers를 뺀 모듈은 순수하다(네트워크·타이머·브라우저 전역 없음). 외부 호출은 src/ai/providers에서만 한다.
 * AI 원문은 항상 normalize를 거친 뒤에만 엔진에 들어가고, 실패·오류·AI 없음이면 rules로 대신한다(ADR-003).
 */
export { prepareText } from './text';
export type { Clause, NumberMention, NumberUnit, PreparedText } from './text';
export { checkSensitive } from './safety';
export { normalizeInterpretation, normalizeVerdict } from './normalize';
export { ruleInterpret, rulesVerdict } from './rules';
export { buildInterpretPrompt, buildVerdictPrompt, evidenceToolResult, VERDICT_TOOL } from './prompts';
export type { VerdictToolSpec } from './prompts';
export { interpretTmi } from './interpret';
export type { InterpretOutcome } from './interpret';
export { judgeTmi } from './verdict';
export type { VerdictOutcome } from './verdict';
export { AiError, pickProvider, resolveArtifactSample } from './providers';
export type { AiErrorCode, AiProvider, InterpretRequest, SampleLike, VerdictRequest } from './providers';
