import type { EngineEffect, EventIndex, EventVector, GameOver, GameState, Mode, PitchSample, Side, Transition } from '../types/domain';
import { calibrateCount, simulatePA, type CountModel } from './count';
import { effectMultipliers, fieldSideOf } from './effects';
import { applyTransition, startNextHalf, type Game, type LineupSlot, type TeamConfig } from './game';
import { matchup } from './matchup';
import { sampleEvent, sampleTransition } from './transitions';

export interface PlayoutInput {
  /** 같은 팀·효과·모드로 만든 경기 (승리확률 기록용) */
  game: Game;
  start: GameState;
  /** 시작 반이닝을 끝까지 던지는 장면 투수 */
  scenePitcher: LineupSlot;
  away: TeamConfig;
  home: TeamConfig;
  lg: EventVector;
  effects: readonly EngineEffect[];
  mode: Mode;
  countTable: number[][] | null;
  /** 시드 난수: 재생의 모든 표본은 여기서만 뽑는다 */
  rng: () => number;
  /** 타석마다 홈 승리확률을 기록한다. 기본 true */
  trackWinProbability?: boolean;
  /** 이만큼 타석을 치고도 경기가 끝나지 않으면 멈춘다. 기본 300 */
  maxPlateAppearances?: number;
}

export interface PlayoutPA {
  index: number;
  before: GameState;
  /** 타석 직후 상태 (반이닝이 끝났으면 3아웃 상태) */
  after: GameState;
  batSide: Side;
  batterId: string;
  pitcherId: string;
  event: EventIndex;
  transition: Transition;
  /** 카운트 표가 없으면 [] */
  pitches: PitchSample[];
  wpHomeBefore: number | null;
  wpHomeAfter: number | null;
  tieAfter: number | null;
  over: GameOver | null;
}

export interface PlayoutResult {
  plateAppearances: PlayoutPA[];
  /** 경기가 끝났으면 마지막 타석 직후, 멈췄으면 다음 타석을 칠 상태 */
  final: GameState;
  /** 멈췄으면 그 시점 점수로 정한다 */
  winner: Side | 'tie';
  walkoff: boolean;
  truncated: boolean;
}

const DEFAULT_MAX_PLATE_APPEARANCES = 300;
/** 승부처 후보: 홈 승리확률이 이만큼 이상 움직인 타석 */
const HIGHLIGHT_SWING = 0.05;
/** 승부처 후보: 이 이닝부터 득점한 타석 */
const LATE_INNING = 7;

const leaderOf = (st: GameState): Side | 'tie' => (st.home > st.away ? 'home' : st.away > st.home ? 'away' : 'tie');

/**
 * 경기를 끝까지(또는 maxPlateAppearances까지) 시드 난수로 다시 치른다. 확률 계산이 아니라 재생 전용이다(ADR-002).
 * 시작 반이닝은 장면 투수, 그 뒤는 수비 팀 불펜이 던진다. 첫 타석에만 scope 'pa' 효과를 쓴다.
 */
export function playout(input: PlayoutInput): PlayoutResult {
  const { game, start, scenePitcher, away, home, lg, effects, mode, countTable, rng } = input;
  const track = input.trackWinProbability ?? true;
  const maxPlateAppearances = input.maxPlateAppearances ?? DEFAULT_MAX_PLATE_APPEARANCES;
  const teamOf = (side: Side) => (side === 'away' ? away : home);
  const batSideOf = (st: GameState): Side => (st.half === 0 ? 'away' : 'home');
  const pitcherFor = (st: GameState): LineupSlot =>
    st.inning === start.inning && st.half === start.half ? scenePitcher : teamOf(fieldSideOf(batSideOf(st))).bullpen;
  /** 같은 타석 분포의 카운트 모델은 한 번만 맞춘다 (분포는 공격 진영·타순·장면 투수 여부·첫 타석 여부로 정해진다) */
  const countModels = new Map<string, CountModel>();

  const plateAppearances: PlayoutPA[] = [];
  let state = start;
  let carriedWp: number | null = null;

  while (plateAppearances.length < maxPlateAppearances) {
    const index = plateAppearances.length;
    const first = index === 0;
    const batSide = batSideOf(state);
    const slot = batSide === 'away' ? state.slotAway : state.slotHome;
    const batter = teamOf(batSide).lineup[slot];
    const pitcher = pitcherFor(state);
    const pa = matchup(
      batter.rel,
      pitcher.rel,
      lg,
      effectMultipliers(effects, { batterId: batter.id, pitcherId: pitcher.id, batSide, first }, mode),
    );
    const wpHomeBefore = track ? (first ? game.evaluate(state, pitcher, { first, detail: false }).winHome : carriedWp) : null;

    let event: EventIndex;
    let pitches: PitchSample[];
    if (countTable) {
      const key = `${batSide}|${slot}|${pitcher === scenePitcher ? 'scene' : 'bullpen'}|${first}`;
      let model = countModels.get(key);
      if (!model) {
        model = calibrateCount(pa, countTable);
        countModels.set(key, model);
      }
      const simulated = simulatePA(model, pa, rng);
      event = simulated.event;
      pitches = simulated.pitches;
    } else {
      event = sampleEvent(pa, rng);
      pitches = [];
    }

    const transition = sampleTransition(state.bases, state.outs, event, rng);
    const { state: after, over } = applyTransition(state, transition);
    const next = over?.kind === 'half' ? startNextHalf(after) : after;

    let wpHomeAfter: number | null = null;
    let tieAfter: number | null = null;
    if (track) {
      if (over?.kind === 'game') {
        wpHomeAfter = over.winner === 'home' ? 1 : 0;
        tieAfter = over.winner === 'tie' ? 1 : 0;
      } else {
        const ev = game.evaluate(next, pitcherFor(next), { first: false, detail: false });
        wpHomeAfter = ev.winHome;
        tieAfter = ev.tie;
      }
    }

    plateAppearances.push({
      index,
      before: state,
      after,
      batSide,
      batterId: batter.id,
      pitcherId: pitcher.id,
      event,
      transition,
      pitches,
      wpHomeBefore,
      wpHomeAfter,
      tieAfter,
      over,
    });

    if (over?.kind === 'game') {
      return { plateAppearances, final: after, winner: over.winner, walkoff: over.walkoff, truncated: false };
    }
    state = next;
    carriedWp = wpHomeAfter;
  }

  return { plateAppearances, final: state, winner: leaderOf(state), walkoff: false, truncated: true };
}

/**
 * 연출할 승부처 타석 번호(오름차순, 길이 ≤ max). 첫 타석과 마지막 타석은 항상 넣고,
 * 나머지는 홈 승리확률 변화가 0.05 이상이거나 7회 이후 득점한 타석을 변화량이 큰 순으로 채운다.
 * 승리확률 기록이 없으면 7회 이후 득점한 타석을 득점 많은 순으로 채운다. max가 1이면 첫 타석만.
 */
export function pickHighlights(result: PlayoutResult, max = 6): number[] {
  const pas = result.plateAppearances;
  const limit = Math.max(0, Math.floor(max));
  if (pas.length === 0 || limit === 0) return [];
  const last = pas.length - 1;
  const picks = new Set<number>([0]);
  if (limit >= 2) picks.add(last);

  const tracked = pas.every((pa) => pa.wpHomeBefore !== null && pa.wpHomeAfter !== null);
  const candidates: { index: number; weight: number }[] = [];
  for (let i = 1; i < last; i++) {
    const pa = pas[i];
    const lateRun = pa.before.inning >= LATE_INNING && pa.transition.runs > 0;
    if (tracked) {
      const swing = Math.abs((pa.wpHomeAfter ?? 0) - (pa.wpHomeBefore ?? 0));
      if (swing >= HIGHLIGHT_SWING || lateRun) candidates.push({ index: i, weight: swing });
    } else if (lateRun) {
      candidates.push({ index: i, weight: pa.transition.runs });
    }
  }
  candidates.sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const candidate of candidates) {
    if (picks.size >= limit) break;
    picks.add(candidate.index);
  }
  return [...picks].sort((a, b) => a - b);
}

/**
 * "평행우주 n번 중 N번": 확률 × n을 내림한 뒤 남는 수를 소수부가 큰 순(같으면 home → tie → away)으로 나눠 합을 정확히 n으로 맞춘다.
 */
export function expectedCounts(
  probs: { winHome: number; tie: number; winAway: number },
  n = 1000,
): { home: number; tie: number; away: number } {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`expectedCounts: n은 0 이상 정수여야 한다 (${n})`);
  const raw =[probs.winHome, probs.tie, probs.winAway].map((p) => (Number.isFinite(p) ? Math.max(0, p) : 0) * n);
  // 곱셈 반올림 잡음(예: 34.999999999999996)이 내림·순서를 뒤집지 않게 1e-9 격자에서 비교한다
  const counts = raw.map((x) => Math.floor(x + 1e-9));
  const fractions = raw.map((x, i) => Math.round((x - counts[i]) * 1e9) / 1e9);
  const order = [0, 1, 2].sort((a, b) => fractions[b] - fractions[a] || a - b);
  let left = n - (counts[0] + counts[1] + counts[2]);
  for (let k = 0; left > 0; k = (k + 1) % 3) {
    counts[order[k]] += 1;
    left -= 1;
  }
  for (let k = 2; left < 0; k = (k + 2) % 3) {
    if (counts[order[k]] > 0) {
      counts[order[k]] -= 1;
      left += 1;
    }
  }
  return { home: counts[0], tie: counts[1], away: counts[2] };
}
