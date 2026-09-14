import type { Interpretation, PromptContext } from '../../types/domain';
import type { EvidenceData } from '../../types/data';

export type AiErrorCode =
  | 'unavailable' | 'tools_unavailable' | 'rate_limited' | 'refused'
  | 'bad_response' | 'cancelled' | 'timeout' | 'network' | 'upstream';

export interface InterpretRequest { text: string; ctx: PromptContext; measuredAvailable: boolean }
export interface VerdictRequest { text: string; interpretation: Interpretation; ctx: PromptContext; evidence: EvidenceData }

export interface AiProvider {
  readonly name: 'artifact' | 'http';
  interpret(req: InterpretRequest, signal?: AbortSignal): Promise<unknown>;
  verdict(req: VerdictRequest, signal?: AbortSignal): Promise<unknown>;
}
