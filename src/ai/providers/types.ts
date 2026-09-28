import type { CallFacts, Interpretation, PromptContext } from '../../types/domain';
import type { EvidenceData } from '../../types/data';

export type AiErrorCode =
  | 'unavailable' | 'tools_unavailable' | 'rate_limited' | 'refused'
  | 'bad_response' | 'cancelled' | 'timeout' | 'network' | 'upstream';

export interface InterpretRequest { text: string; ctx: PromptContext; measuredAvailable: boolean }
export interface VerdictRequest { text: string; interpretation: Interpretation; ctx: PromptContext; evidence: EvidenceData }
/** 해설 자막 요청(23-commentary): 끝난 타석 사실만 보낸다. 장면 맥락·타순은 자막에 쓰지 않는다 */
export interface CallRequest { facts: CallFacts }

export interface AiProvider {
  readonly name: 'artifact' | 'http';
  interpret(req: InterpretRequest, signal?: AbortSignal): Promise<unknown>;
  verdict(req: VerdictRequest, signal?: AbortSignal): Promise<unknown>;
  call(req: CallRequest, signal?: AbortSignal): Promise<unknown>;
}
