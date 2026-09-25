import { MEASURED } from '../domain/measured';
import { compileEffects } from '../engine';
import type { EvidenceData } from '../types/data';
import type { EffectApplies, EngineEffect, Mode, TmiEntry } from '../types/domain';
import type { SituationSetup } from './situation';

/** 실측 변수를 해석에 쓸 수 있는가: evidence에 applicable 변수의 유한한 beta가 하나라도 있으면 true */
export function measuredAvailable(evidence: EvidenceData | null): boolean {
  if (!evidence) return false;
  return evidence.items.some((item) => Number.isFinite(item.beta) && MEASURED.some((def) => def.id === item.id && def.applicable));
}

/**
 * 세션 TMI 목록을 엔진 효과로 바꾼다. 거부된 해석은 건너뛰고, 각 entry는 장면 기준(setup.sceneContext)으로
 * compileEffects해 순서대로 이어 붙인다. 효과 크기는 전부 엔진이 정한다.
 */
export function compileSessionEffects(entries: readonly TmiEntry[], setup: SituationSetup, evidence: EvidenceData | null): EngineEffect[] {
  const effects: EngineEffect[] = [];
  for (const entry of entries) {
    if (entry.interpretation.refused) continue;
    effects.push(...compileEffects(entry.interpretation.parts, setup.sceneContext, { sourceId: entry.id, evidence, lg: setup.lg }));
  }
  return effects;
}

function appliesKey(applies: EffectApplies): readonly string[] {
  switch (applies.on) {
    case 'batter':
    case 'pitcher':
      return [applies.on, applies.id];
    case 'batting':
    case 'fielding':
      return [applies.on, applies.side];
    default:
      return [applies.on];
  }
}

/**
 * 캐시 키: 모드와 효과마다 (대상, 범위, 로그 오즈)가 같으면 같은 문자열. 속성 순서와 무관하다.
 * sourceId는 확률 계산에 쓰이지 않으므로 넣지 않는다. 효과 순서는 합산 순서라 그대로 둔다.
 */
export function effectsKey(effects: readonly EngineEffect[], mode: Mode): string {
  return JSON.stringify([mode, effects.map((fx) => [appliesKey(fx.applies), fx.scope, Array.from(fx.logOdds)])]);
}
