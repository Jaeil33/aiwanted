import { buildInterpretPrompt, buildVerdictPrompt, evidenceToolResult, VERDICT_TOOL } from '../prompts';
import { fromSampleError } from './errors';
import type { AiProvider } from './types';

/** 아티팩트 런타임 claude.use('sample')이 주는 네임스페이스 중 이 앱이 쓰는 부분 */
export interface SampleLike {
  json(input: string, options?: Record<string, unknown>): Promise<unknown>;
}

/*
 * 아티팩트 미리보기 프로바이더(ADR-006): 해석은 quick, 판정은 default tier + lookupEvidence 도구.
 * 첫 호출에서 보는 사람의 동의를 기다리므로 페이지 쪽 제한 시간을 두지 않고, 코드에서 재시도하지 않는다.
 * 도구를 쓸 때는 cache 옵션을 넘기지 않는다(sample 계약). 오류는 fromSampleError로 AiError가 된다.
 */
export function createArtifactProvider(sample: SampleLike): AiProvider {
  async function call(input: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    try {
      // 플랫폼 네임스페이스는 얼어 있는 객체다: json을 떼어 내지 않고 메서드로 부른다.
      return await sample.json(input, signal ? { ...options, signal } : options);
    } catch (e) {
      throw fromSampleError(e);
    }
  }

  return {
    name: 'artifact',
    interpret(req, signal) {
      const prompt = buildInterpretPrompt(req.text, req.ctx, { measuredAvailable: req.measuredAvailable });
      return call(prompt, { modelTier: 'quick' }, signal);
    },
    verdict(req, signal) {
      const tools = [
        {
          ...VERDICT_TOOL,
          execute: (input: Record<string, unknown>) =>
            evidenceToolResult(req.evidence, typeof input === 'object' && input !== null ? input.variable : undefined),
        },
      ];
      return call(buildVerdictPrompt(req.text, req.interpretation, req.ctx), { modelTier: 'default', tools }, signal);
    },
  };
}

function isObjectLike(x: unknown): x is object {
  return (typeof x === 'object' && x !== null) || typeof x === 'function';
}

function isSampleLike(x: unknown): x is SampleLike {
  return isObjectLike(x) && typeof (x as { json?: unknown }).json === 'function';
}

/**
 * 아티팩트 런타임에서 sample을 찾는다. win.claude.use가 없으면(아티팩트 밖) 곧바로 null이고,
 * use('sample')이 json 함수를 가진 값(런타임에서는 함수 객체)을 주면 그 값, null·reject·다른 모양이면 null.
 * win은 브라우저 window나 테스트용 가짜 객체다. DOM의 Window 타입에 claude가 없어도 넘길 수 있게 unknown으로 받는다.
 */
export async function resolveArtifactSample(win: unknown): Promise<SampleLike | null> {
  const claude = isObjectLike(win) ? (win as { claude?: unknown }).claude : undefined;
  if (!isObjectLike(claude) || typeof (claude as { use?: unknown }).use !== 'function') return null;
  try {
    const sample: unknown = await (claude as { use(name: string): unknown }).use('sample');
    return isSampleLike(sample) ? sample : null;
  } catch {
    return null;
  }
}
