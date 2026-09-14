import { SUBJECT_LABEL } from '../domain/knobs';
import { MEASURED, transformValue } from '../domain/measured';
import type { EvidenceData, EvidenceItem } from '../types/data';
import type {
  EffectApplies,
  EffectPart,
  EngineEffect,
  EventVector,
  MeasuredDef,
  MeasuredPart,
  MeasuredWho,
  SceneContext,
  Subject,
} from '../types/domain';
import { compileKnobPart, fieldSideOf } from './effects';
import { halfInning, halfSummary } from './halfInning';
import { KNOB_WEIGHTS } from './knobs';
import { matchup } from './matchup';

/** 공격 전반 벡터: 팀 분위기(mood) 손잡이 가중치 */
export const OFFENSE_W: EventVector = KNOB_WEIGHTS.mood;

/** 탄력성 중앙 차분 간격 */
const ELASTICITY_H = 0.01;
const ONES: EventVector = [1, 1, 1, 1, 1, 1, 1];
/** lg 값 문자열 → 득점 탄력성 */
const elasticityCache = new Map<string, number>();

/** 리그 평균 타선(9명 rel 1, 투수 rel 1)의 모든 타석에 exp(k × OFFENSE_W)를 곱했을 때 무사 주자 없음 반이닝 기대 득점 */
function leagueHalfRuns(lg: EventVector, k: number): number {
  const dist = matchup(ONES, ONES, lg, OFFENSE_W.map((w) => Math.exp(k * w)));
  const dists = Array.from({ length: 9 }, () => dist);
  return halfSummary(halfInning(dists, { slot: 0, outs: 0, bases: 0 })).expRuns;
}

/**
 * 리그 평균 타선의 득점 탄력성 d ln(반이닝 기대 득점) / dk (k=0, 중앙 차분 h=0.01).
 * 실측 변수의 득점 배수를 공격 벡터 크기로 바꿀 때 나눈다. lg 값 문자열로 캐시한다.
 */
export function runsElasticity(lg: EventVector): number {
  const key = lg.join(',');
  const cached = elasticityCache.get(key);
  if (cached !== undefined) return cached;
  const h = ELASTICITY_H;
  const value = (Math.log(leagueHalfRuns(lg, h)) - Math.log(leagueHalfRuns(lg, -h))) / (2 * h);
  elasticityCache.set(key, value);
  return value;
}

/** 실측 변수 값의 득점 배수 = exp(beta × 변환값). beta는 evidence(파이프라인 산출물)에서만 온다 */
export function measuredRunsRatio(def: MeasuredDef, item: EvidenceItem, value: number): number {
  return Math.exp(item.beta * transformValue(def, value));
}

const isSubject = (x: unknown): x is Subject => typeof x === 'string' && Object.hasOwn(SUBJECT_LABEL, x);

/** 실측 변수 대상 확정. 정할 수 없으면 null */
function measuredApplies(who: MeasuredWho, subject: Subject, ctx: SceneContext): EffectApplies | null {
  // 환경 변수는 대상과 상관없이 모든 타석에 적용한다
  if (who === 'env') return { on: 'all' };
  if (!isSubject(subject)) return null;
  const other = fieldSideOf(ctx.batSide);
  switch (who) {
    case 'team':
      // 그 팀의 득점에 대한 효과
      if (subject === 'everyone') return { on: 'all' };
      return { on: 'batting', side: subject === 'batter' || subject === 'battingTeam' ? ctx.batSide : other };
    case 'opponentStarter':
      // 그 선발을 상대하는 팀의 득점에 대한 효과: 그 선발의 팀이 수비할 때 적용한다
      if (subject === 'everyone') return null;
      return { on: 'fielding', side: subject === 'pitcher' || subject === 'fieldingTeam' ? other : ctx.batSide };
    default:
      return null;
  }
}

/**
 * 실측 변수 해석 한 조각을 엔진 효과로 바꾼다: scale = ln(득점 배수) / runsElasticity(lg), logOdds = scale × OFFENSE_W, 경기 내내.
 * applicable이 아니거나, evidence·항목이 없거나, 값·beta가 유한수가 아니거나, 대상을 정할 수 없으면 [].
 */
export function compileMeasuredPart(
  part: MeasuredPart,
  ctx: SceneContext,
  evidence: EvidenceData | null,
  lg: EventVector,
  sourceId: string,
): EngineEffect[] {
  const def = MEASURED.find((d) => d.id === part.variable);
  if (!def || !def.applicable || !evidence) return [];
  if (typeof part.value !== 'number' || !Number.isFinite(part.value)) return [];
  const item = evidence.items.find((x) => x.id === def.id);
  if (!item || !Number.isFinite(item.beta)) return [];
  const applies = measuredApplies(def.who, part.subject, ctx);
  if (!applies) return [];
  const scale = Math.log(measuredRunsRatio(def, item, part.value)) / runsElasticity(lg);
  if (!Number.isFinite(scale)) return [];
  return [{ applies, logOdds: OFFENSE_W.map((w) => scale * w), scope: 'game', sourceId }];
}

/** TMI 해석 조각들을 순서대로 엔진 효과로 바꿔 이어 붙인다 (knob → compileKnobPart, measured → compileMeasuredPart) */
export function compileEffects(
  parts: readonly EffectPart[],
  ctx: SceneContext,
  opts: { sourceId: string; evidence: EvidenceData | null; lg: EventVector },
): EngineEffect[] {
  const effects: EngineEffect[] = [];
  for (const part of parts) {
    if (part.kind === 'knob') effects.push(...compileKnobPart(part, ctx, opts.sourceId));
    else if (part.kind === 'measured') effects.push(...compileMeasuredPart(part, ctx, opts.evidence, opts.lg, opts.sourceId));
  }
  return effects;
}
