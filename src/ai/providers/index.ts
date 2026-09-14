import { createArtifactProvider } from './artifact';
import type { SampleLike } from './artifact';
import { createHttpProvider } from './http';
import type { AiProvider } from './types';

/*
 * AI 프로바이더. 외부 호출(아티팩트 런타임·fetch·타이머)은 이 폴더 안에만 있다(CLAUDE.md).
 * 선택 순서(ARCHITECTURE "AI"): 아티팩트 런타임 sample → 배포 /api(apiBase와 fetch가 있을 때) → 없음(null = 규칙 해석).
 */
export function pickProvider(env: { artifactSample: SampleLike | null; apiBase: string | null; fetch?: typeof fetch }): AiProvider | null {
  if (env.artifactSample) return createArtifactProvider(env.artifactSample);
  if (env.apiBase && env.fetch) return createHttpProvider({ baseUrl: env.apiBase, fetch: env.fetch });
  return null;
}

export { createArtifactProvider, resolveArtifactSample } from './artifact';
export type { SampleLike } from './artifact';
export { createHttpProvider } from './http';
export type { HttpProviderOptions } from './http';
export { AiError, fromSampleError } from './errors';
export type { AiErrorCode, AiProvider, InterpretRequest, VerdictRequest } from './types';
