import { KNOB_META, SUBJECTS_FOR } from '../domain/knobs';
import type { EffectApplies, EngineEffect, KnobPart, KnobWho, Mode, SceneContext, Side, Subject } from '../types/domain';
import { KNOB_WEIGHTS, STEP } from './knobs';

/** 현실 모드: 한 사건의 로그 오즈 변화 상한 (최대 약 ×3.3, ADR-026) */
export const REAL_LOG_CAP = 1.2;
/** 만화 모드: 로그 오즈 과장 배수 (ADR-009) */
export const TOON_FACTOR = 6;
/** 만화 모드: 로그 오즈 상한 (최대 약 ×10, ADR-026) */
export const TOON_LOG_CAP = 2.3;

/** 효과 배수를 계산할 한 타석 */
export interface PaContext {
  batterId: string;
  pitcherId: string;
  batSide: Side;
  /** 장면의 첫 타석이면 true: scope 'pa' 효과는 이때만 적용한다 */
  first: boolean;
}

export function fieldSideOf(batSide: Side): Side {
  return batSide === 'away' ? 'home' : 'away';
}

/** 팀(mood)을 뺀 손잡이의 대상 확정. subject는 SUBJECTS_FOR로 이미 검증했다 */
function knobApplies(who: Exclude<KnobWho, 'team'>, subject: Subject, ctx: SceneContext): EffectApplies {
  if (who === 'env' || subject === 'everyone') return { on: 'all' };
  if (who === 'batter') {
    return subject === 'batter' ? { on: 'batter', id: ctx.batterId } : { on: 'batting', side: ctx.batSide };
  }
  return subject === 'pitcher' ? { on: 'pitcher', id: ctx.pitcherId } : { on: 'fielding', side: fieldSideOf(ctx.batSide) };
}

/**
 * 손잡이 해석 한 조각을 엔진 효과로 바꾼다. TMI를 넣은 순간의 장면(ctx) 타자·투수·진영이 대상이다.
 * 알 수 없는 손잡이, 손잡이에 맞지 않는 대상, 유한수가 아니거나 반올림하면 0인 세기는 효과가 없다([]).
 */
export function compileKnobPart(part: KnobPart, ctx: SceneContext, sourceId: string): EngineEffect[] {
  const { knob, subject, scope } = part;
  if (typeof knob !== 'string' || !Object.hasOwn(KNOB_WEIGHTS, knob)) return [];
  const who = KNOB_META[knob].who;
  if (!SUBJECTS_FOR[who].includes(subject)) return [];
  if (typeof part.strength !== 'number' || !Number.isFinite(part.strength)) return [];
  const strength = Math.max(-3, Math.min(3, Math.round(part.strength)));
  if (strength === 0) return [];

  const logOdds = KNOB_WEIGHTS[knob].map((w) => STEP * strength * w);
  if (who === 'team') {
    // 대상 팀이 공격할 때는 그 팀 타자에게 유리(+), 수비할 때는 상대 타자에게 불리(−)
    const side = subject === 'battingTeam' ? ctx.batSide : fieldSideOf(ctx.batSide);
    return [
      { applies: { on: 'batting', side }, logOdds, scope, sourceId },
      { applies: { on: 'fielding', side }, logOdds: logOdds.map((x) => -x), scope, sourceId },
    ];
  }
  return [{ applies: knobApplies(who, subject, ctx), logOdds, scope, sourceId }];
}

/** 효과 대상이 이 타석에 해당하는지 */
export function appliesTo(applies: EffectApplies, pa: PaContext): boolean {
  switch (applies.on) {
    case 'all':
      return true;
    case 'batter':
      return applies.id === pa.batterId;
    case 'pitcher':
      return applies.id === pa.pitcherId;
    case 'batting':
      return applies.side === pa.batSide;
    case 'fielding':
      return applies.side === fieldSideOf(pa.batSide);
    default:
      return false;
  }
}

/**
 * 타석 사건별 효과 배수: 해당하는 효과의 로그 오즈 합(scope 'pa'는 첫 타석만) × 모드 배수를
 * 모드 상한(현실 ±0.45, 만화 ±1.6)으로 자른 뒤 exp. 효과가 없으면 전부 1.
 */
export function effectMultipliers(effects: readonly EngineEffect[], pa: PaContext, mode: Mode): Float64Array {
  const log = new Float64Array(7);
  for (const fx of effects) {
    if (fx.scope === 'pa' && !pa.first) continue;
    if (!appliesTo(fx.applies, pa)) continue;
    for (let i = 0; i < 7; i++) log[i] += fx.logOdds[i];
  }
  const toon = mode === 'toon';
  const factor = toon ? TOON_FACTOR : 1;
  const cap = toon ? TOON_LOG_CAP : REAL_LOG_CAP;
  const m = new Float64Array(7);
  for (let i = 0; i < 7; i++) m[i] = Math.exp(Math.max(-cap, Math.min(cap, log[i] * factor)));
  return m;
}
