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
 * 세션 TMI 목록을 엔진 효과로 바꾼다. 거부된 해석은 건너뛴다. 효과 크기는 전부 엔진이 정한다.
 *
 * 대상은 **건 순간의 기준**(entry.context)으로 확정한다: 3번 타석에 "타자가…"라고 걸면 3번 타자에게 걸린다(ADR-033).
 * 기준이 없는 옛 entry는 상황 기준(setup.sceneContext)이다.
 *
 * `paIndex`를 주면 그 타석에서 쓸 효과만 남긴다: `scope: 'pa'` 효과는 그것을 건 타석에만 걸린다.
 * 나머지(scope 'game')는 판이 끝날 때까지 그대로 남는다 — 새로 걸지 않으면 앞 타석 TMI가 유지된다(Q13).
 */
export function compileSessionEffects(
  entries: readonly TmiEntry[],
  setup: SituationSetup,
  evidence: EvidenceData | null,
  opts: { paIndex?: number } = {},
): EngineEffect[] {
  const effects: EngineEffect[] = [];
  for (const entry of entries) {
    if (entry.interpretation.refused) continue;
    const ctx = entry.context ?? setup.sceneContext;
    const compiled = compileEffects(entry.interpretation.parts, ctx, { sourceId: entry.id, evidence, lg: setup.lg });
    const mine = opts.paIndex === undefined || (entry.paIndex ?? 0) === opts.paIndex;
    effects.push(...(mine ? compiled : compiled.filter((fx) => fx.scope !== 'pa')));
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
