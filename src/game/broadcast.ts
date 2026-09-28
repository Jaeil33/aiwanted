import { formatPct } from '../domain/format';
import type { CallFacts, CallTmi, EffectPart, Evidence, GameState, Half, Side, TmiEntry } from '../types/domain';
import { gradeOf } from './headline';
import { effectLabel } from './result';
import type { PlayLogEntry } from './session';
import { batterFor, nameOf, pitcherFor, type SituationSetup } from './situation';
import { battingWin, type GaugeLike } from './selectors';

/*
 * 중계 시안 플레이 화면(ADR-025)의 확률 판·TMI 칩 파생 값. 숫자는 엔진 게이지에서 고르고 빼기만 한다(CLAUDE.md CRITICAL).
 */

export type Tier = 'game' | 'inning' | 'pa';

export const TIER_LABEL: Record<Tier, string> = { game: '경기', inning: '이닝', pa: '타석' };

/** 승률 막대: 왼쪽(공격) · 무승부 · 오른쪽, 기준선(TMI 없음) 위치 */
export interface TierBar {
  left: number;
  tie: number;
  right: number;
  ghost: number;
  leftColor: string;
  rightColor: string;
}

export interface TierReadout {
  tier: Tier;
  label: string;
  /** 막대 오른쪽 이름: 경기 "KIA", 이닝 "KIA 무실점", 타석 "원정투수 아웃" */
  rightLabel: string;
  /** TMI 반영 값(0~1) */
  value: number;
  /** TMI 없음 값(0~1) */
  base: number;
  /** (value − base) × 100 */
  deltaPp: number;
  bar: TierBar;
  /** 보조 줄 조각("무승부 12.1%", "NC 29.9%"). "TMI 없이"와 모드는 화면이 붙인다 */
  sub: string[];
}

const batSideOf = (state: Pick<GameState, 'half'>): Side => (state.half === 0 ? 'away' : 'home');
const other = (side: Side): Side => (side === 'away' ? 'home' : 'away');

/** 탭 한 줄의 값: 경기는 장면 공격 팀 승리, 이닝은 이번 이닝 득점, 타석은 타자 출루 */
export function tierValue(tier: Tier, setup: SituationSetup, gauge: GaugeLike): number {
  if (tier === 'game') return battingWin(gauge, setup.batSide);
  return tier === 'inning' ? gauge.inningScore : gauge.batterWin;
}

/** 경기·이닝·타석 확률 판 한 장. 경기는 장면 공격 팀 기준으로 고정하고(무승부는 따로 보인다), 이닝·타석은 지금 상태 기준 */
export function tierReadout(args: { tier: Tier; setup: SituationSetup; state: GameState; base: GaugeLike; tmi: GaugeLike }): TierReadout {
  const { tier, setup, state, base, tmi } = args;
  const value = tierValue(tier, setup, tmi);
  const baseValue = tierValue(tier, setup, base);
  const common = { tier, value, base: baseValue, deltaPp: (value - baseValue) * 100 };

  if (tier === 'game') {
    const bat = setup.batSide;
    const fld = other(bat);
    const right = battingWin(tmi, fld);
    return {
      ...common,
      label: `${setup.situation[bat].name} 승리확률`,
      rightLabel: setup.situation[fld].name,
      bar: { left: value, tie: tmi.tie, right, ghost: baseValue, leftColor: setup.teamColors[bat], rightColor: setup.teamColors[fld] },
      sub: [`무승부 ${formatPct(tmi.tie)}`, `${setup.situation[fld].name} ${formatPct(right)}`],
    };
  }

  const bat = batSideOf(state);
  const bar = { left: value, tie: 0, right: 1 - value, ghost: baseValue, leftColor: setup.teamColors[bat], rightColor: setup.teamColors[other(bat)] };
  if (tier === 'inning') {
    const runs = [base.expRuns, tmi.expRuns];
    const sub = runs.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [`기대 득점 ${runs[0]!.toFixed(2)}→${runs[1]!.toFixed(2)}점`] : [];
    return { ...common, label: `${setup.situation[bat].name} 이번 이닝 득점확률`, rightLabel: `${setup.situation[other(bat)].name} 무실점`, bar, sub };
  }
  return {
    ...common,
    label: `${batterFor(setup, state).name} 출루확률`,
    rightLabel: `${nameOf(setup, pitcherFor(setup, state).id)} 아웃`,
    bar,
    sub: [`${nameOf(setup, pitcherFor(setup, state).id)} 아웃 ${formatPct(1 - value)}`],
  };
}

/** 시안 변화 표기(%p 단위 숫자): 1 미만은 소수 둘째 자리, 이상은 첫째 자리, 0.005 미만·숫자 아님은 ±0.00 */
export function deltaText(pp: number): string {
  const a = Math.abs(pp);
  if (!(a >= 0.005)) return '±0.00%p';
  return `${pp > 0 ? '+' : '−'}${a < 1 ? a.toFixed(2) : a.toFixed(1)}%p`;
}

export type PillTone = Evidence | 'none' | 'refused';

export interface TmiPill {
  id: string;
  text: string;
  /** "투수 체력 ↓", "기온 35°C", "효과 없음" */
  effect: string;
  tone: PillTone;
}

/** 걸린 TMI 칩: 문장·첫 효과("외 N")·근거 등급(가장 약한 등급) */
export function tmiPill(entry: TmiEntry): TmiPill {
  const { interpretation } = entry;
  const base = { id: entry.id, text: entry.text };
  if (interpretation.refused) return { ...base, effect: '계산 안 함', tone: 'refused' };
  const parts = interpretation.parts;
  if (parts.length === 0) return { ...base, effect: '효과 없음', tone: 'none' };
  const first = effectLabel(parts[0]);
  return { ...base, effect: parts.length > 1 ? `${first} 외 ${parts.length - 1}` : first, tone: gradeOf([entry]) ?? 'none' };
}

/** 추이선 한 점: 게이지를 받은 순간의 타석 번호·반이닝과 TMI 반영 게이지 */
export interface SparkPoint {
  paIndex: number;
  inning: number;
  half: Half;
  tmi: GaugeLike;
}

/** 추이선 값: 경기는 판 전체, 이닝은 지금 반이닝, 타석은 지금 타석의 점만 */
export function sparkSeries(points: readonly SparkPoint[], tier: Tier, setup: SituationSetup, now: { paIndex: number; inning: number; half: Half }): number[] {
  const kept = points.filter((p) => (tier === 'game' ? true : tier === 'inning' ? p.inning === now.inning && p.half === now.half : p.paIndex === now.paIndex));
  return kept.map((p) => tierValue(tier, setup, p.tmi));
}


/*
 * 끝난 타석 하나 → 해설 자막 재료(23-commentary).
 * 확률은 담지 않는다: 자막은 숫자를 말하지 않는다(CLAUDE.md CRITICAL). 점수와 이닝만 넘긴다.
 */

/**
 * 그 타석에 걸려 있던 TMI인가. compileSessionEffects와 같은 규칙이다 —
 * 타석 한정(scope 'pa') 효과는 그것을 건 타석에만, 나머지는 경기 내내 간다(ADR-033).
 */
function ranInPa(entry: TmiEntry, paIndex: number): boolean {
  if (entry.interpretation.refused) return false;
  if ((entry.paIndex ?? 0) === paIndex) return true;
  return entry.interpretation.parts.some((part) => part.kind !== 'knob' || part.scope !== 'pa');
}

/**
 * 손잡이가 양수일 때 누구 편인가(KNOB_META의 hint를 그대로 옮긴 표).
 * mood는 팀 손잡이라 대상(공격팀·수비팀)을 봐야 갈린다.
 */
const KNOB_FAVORS: Record<string, 'batter' | 'pitcher' | 'bySubject'> = {
  contact: 'batter', power: 'batter', eye: 'batter', focus: 'batter', speed: 'batter',
  stuff: 'pitcher', control: 'pitcher', stamina: 'pitcher', nerve: 'pitcher',
  defense: 'pitcher',
  carry: 'batter', slick: 'batter', glare: 'pitcher',
  mood: 'bySubject',
};

/**
 * 그 효과가 누구 편이었나. 자막이 인과를 뒤집어 부르는 데 쓴다.
 * 실측 변수는 방향이 변수마다 달라 여기서 가리지 않는다(null).
 */
function favorsOf(part: EffectPart | undefined): CallTmi['favors'] {
  if (!part || part.kind !== 'knob') return null;
  const side = Object.hasOwn(KNOB_FAVORS, part.knob) ? KNOB_FAVORS[part.knob] : null;
  if (side === null) return null;
  const positive =
    side === 'bySubject'
      ? part.subject === 'battingTeam'
        ? 'batter'
        : part.subject === 'fieldingTeam'
          ? 'pitcher'
          : null
      : side;
  if (positive === null) return null;
  const flipped = positive === 'batter' ? 'pitcher' : 'batter';
  return part.strength > 0 ? positive : flipped;
}

/** 마지막으로 끝난 타석의 자막 재료. 끝난 타석이 없으면 null */
export function callFactsOf(setup: SituationSetup, log: readonly PlayLogEntry[], tmis: readonly TmiEntry[]): CallFacts | null {
  const entry = log[log.length - 1];
  if (!entry) return null;
  const start = setup.situation.state;
  const before = log.length > 1 ? log[log.length - 2].score : { away: start.away, home: start.home };
  const bat: Side = entry.half === 0 ? 'away' : 'home';

  return {
    inningText: `${entry.inning}회${entry.half === 0 ? '초' : '말'}`,
    batter: entry.batterName,
    pitcher: entry.pitcherName,
    battingTeam: setup.situation[bat].name,
    fieldingTeam: setup.situation[other(bat)].name,
    result: entry.headline,
    runs: entry.score.away - before.away + (entry.score.home - before.home),
    score: { ...entry.score },
    awayName: setup.situation.away.name,
    homeName: setup.situation.home.name,
    tmis: tmis
      .filter((tmi) => ranInPa(tmi, entry.index))
      .map((tmi) => ({ text: tmi.text, effect: tmiPill(tmi).effect, favors: favorsOf(tmi.interpretation.parts[0]) })),
  };
}
