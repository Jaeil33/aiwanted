import type { EngineEffect, EventIndex, EventVector, GameOver, GameState, Mode, Side, Transition } from '../types/domain';
import { calibrateCount, outcomeAtCount, type CountModel } from './count';
import { effectMultipliers } from './effects';
import { RMAX, halfInning } from './halfInning';
import { batterWin, matchup } from './matchup';
import { transitions } from './transitions';

/** KBO 정규시즌: 11회말이 끝나도 동점이면 무승부 */
export const MAX_INN = 11;
/** 점수차 상한: 이보다 큰 차이는 이 값으로 본다 */
export const DMAX = 20;

const WIDTH = 2 * DMAX + 1;
/** 이후 반이닝 분포에서 이보다 작은 칸은 버린다 (engine.js 그대로) */
const SPARSE_EPS = 1e-16;

export interface LineupSlot {
  id: string;
  /** 리그 대비 상대값, 길이 7 */
  rel: EventVector;
}

export interface TeamConfig {
  /** 타순 0~8의 9명 */
  lineup: LineupSlot[];
  /** 장면 반이닝 이후를 던지는 불펜 합성 선수 */
  bullpen: LineupSlot;
}

export interface GameConfig {
  lg: EventVector;
  away: TeamConfig;
  home: TeamConfig;
  effects: readonly EngineEffect[];
  mode: Mode;
  countTable: number[][] | null;
}

/** 이번 타석이 그 사건으로 끝난 직후의 확률 */
export interface AfterEvent {
  winHome: number;
  tie: number;
  winAway: number;
  inningScore: number;
}

export interface Evaluation {
  batSide: Side;
  /** 이번 타석 사건 분포 */
  pa: Float64Array;
  /** 타자 출루 확률 */
  batterWin: number;
  pitcherWin: number;
  /** 지금부터 이 반이닝에 공격 팀이 1점 이상 낼 확률 */
  inningScore: number;
  /** 지금부터 이 반이닝 기대 득점 */
  expRuns: number;
  winHome: number;
  tie: number;
  winAway: number;
  /** 사건 순서 7개 (detail: false면 []) */
  after: AfterEvent[];
  /** 이번 타석 볼카운트 모델 (countTable이 없거나 detail: false면 null) */
  count: CountModel | null;
}

export interface EvaluateOptions {
  /** 장면의 첫 타석이면 true: scope 'pa' 효과를 이번 타석에 쓴다. 기본 true */
  first?: boolean;
  /** false면 after·count 계산을 건너뛴다(재생용 빠른 평가). 기본 true */
  detail?: boolean;
}

export interface Game {
  evaluate(st: GameState, pitcher: LineupSlot, opts?: EvaluateOptions): Evaluation;
}

const isIndex = (x: number, size: number) => Number.isInteger(x) && x >= 0 && x < size;
const isScore = (x: number) => Number.isInteger(x) && x >= 0;

function assertState(st: GameState): void {
  const ok =
    Number.isInteger(st.inning) &&
    st.inning >= 1 &&
    st.inning <= MAX_INN &&
    (st.half === 0 || st.half === 1) &&
    isIndex(st.slotAway, 9) &&
    isIndex(st.slotHome, 9) &&
    isScore(st.away) &&
    isScore(st.home);
  if (!ok) {
    throw new RangeError(`evaluate: 이닝 1~${MAX_INN}, 초말 0·1, 타순 0~8, 점수는 0 이상 정수여야 한다 (${JSON.stringify(st)})`);
  }
}

/**
 * 경기 확률 엔진 (engine.js createGame): 이후 반이닝 분포를 미리 계산하고, 이닝·점수차·양 팀 타순 동적 계획으로
 * 반이닝이 끝난 뒤의 [홈 승, 무승부]를 채운다. evaluate는 현재 반이닝을 넘겨준 투수로 정확히 전파한다.
 * 규칙: 9회 이후 반이닝이 끝났을 때 점수가 다르면 종료, 11회말이 끝나면 무승부, 9회 이후 홈팀이 앞서면 말 공격 없음,
 * 말 공격 중 홈팀이 앞서는 순간 끝내기. 이후 반이닝은 수비 팀 bullpen이 던진다.
 */
export function createGame(cfg: GameConfig): Game {
  const { lg, away, home, effects, mode, countTable } = cfg;
  if (away.lineup.length !== 9 || home.lineup.length !== 9) {
    throw new RangeError(`createGame: 타선은 9명이어야 한다 (원정 ${away.lineup.length}명, 홈 ${home.lineup.length}명)`);
  }
  const teamOf = (side: Side) => (side === 'away' ? away : home);

  /** batSide 타선 9명이 pitcher를 상대하는 타석 분포 (장면 첫 타석이 아니므로 first: false) */
  const distsFor = (batSide: Side, pitcher: LineupSlot) =>
    teamOf(batSide).lineup.map((b) =>
      matchup(b.rel, pitcher.rel, lg, effectMultipliers(effects, { batterId: b.id, pitcherId: pitcher.id, batSide, first: false }, mode)),
    );

  /** 반이닝 분포의 질량 있는 칸을 [r, s, p, r, s, p, ...]로 모은다 */
  const sparse = (hd: Float64Array): number[] => {
    const list: number[] = [];
    for (let r = 0; r <= RMAX; r++) {
      for (let s = 0; s < 9; s++) {
        if (hd[r * 9 + s] > SPARSE_EPS) list.push(r, s, hd[r * 9 + s]);
      }
    }
    return list;
  };

  // 이후 반이닝: 원정 타선은 홈 불펜, 홈 타선은 원정 불펜을 상대한다
  const awayLater = distsFor('away', home.bullpen);
  const homeLater = distsFor('home', away.bullpen);
  const halvesAway: number[][] = [];
  const halvesHome: number[][] = [];
  for (let s = 0; s < 9; s++) {
    halvesAway.push(sparse(halfInning(awayLater, { slot: s, outs: 0, bases: 0 })));
    halvesHome.push(sparse(halfInning(homeLater, { slot: s, outs: 0, bases: 0 })));
  }

  // [이닝][(점수차 + DMAX) × 81 + 원정 타순 × 9 + 홈 타순]: 그 반이닝 시작 때 홈 승·무승부 확률
  const size = WIDTH * 81;
  const tables = () => Array.from({ length: MAX_INN + 2 }, () => new Float64Array(size));
  const topWin = tables();
  const topTie = tables();
  const botWin = tables();
  const botTie = tables();
  const index = (d: number, sA: number, sH: number) => ((d > DMAX ? DMAX : d < -DMAX ? -DMAX : d) + DMAX) * 81 + sA * 9 + sH;

  /** i회말이 끝나고 홈 − 원정 = d일 때 [홈 승, 무승부] */
  const afterBottom = (i: number, d: number, sA: number, sH: number, out: number[]) => {
    if (i >= 9 && d !== 0) {
      out[0] = d > 0 ? 1 : 0;
      out[1] = 0;
    } else if (i >= MAX_INN) {
      out[0] = 0;
      out[1] = 1;
    } else {
      const k = index(d, sA, sH);
      out[0] = topWin[i + 1][k];
      out[1] = topTie[i + 1][k];
    }
  };

  /** i회말을 시작할 때 [홈 승, 무승부]. 9회 이후 홈팀이 앞서면 말 공격 없이 끝난다 */
  const startBottom = (i: number, d: number, sA: number, sH: number, out: number[]) => {
    if (i >= 9 && d > 0) {
      out[0] = 1;
      out[1] = 0;
    } else {
      const k = index(d, sA, sH);
      out[0] = botWin[i][k];
      out[1] = botTie[i][k];
    }
  };

  const tmp = [0, 0];
  for (let i = MAX_INN; i >= 1; i--) {
    for (let di = 0; di < WIDTH; di++) {
      for (let sA = 0; sA < 9; sA++) {
        for (let sH = 0; sH < 9; sH++) {
          const k = di * 81 + sA * 9 + sH;
          const list = halvesHome[sH];
          let w = 0;
          let t = 0;
          for (let j = 0; j < list.length; j += 3) {
            afterBottom(i, di - DMAX + list[j], sA, list[j + 1], tmp);
            w += list[j + 2] * tmp[0];
            t += list[j + 2] * tmp[1];
          }
          botWin[i][k] = w;
          botTie[i][k] = t;
        }
      }
    }
    for (let di = 0; di < WIDTH; di++) {
      for (let sA = 0; sA < 9; sA++) {
        for (let sH = 0; sH < 9; sH++) {
          const k = di * 81 + sA * 9 + sH;
          const list = halvesAway[sA];
          let w = 0;
          let t = 0;
          for (let j = 0; j < list.length; j += 3) {
            startBottom(i, di - DMAX - list[j], list[j + 1], sH, tmp);
            w += list[j + 2] * tmp[0];
            t += list[j + 2] * tmp[1];
          }
          topWin[i][k] = w;
          topTie[i][k] = t;
        }
      }
    }
  }

  function evaluate(st: GameState, pitcher: LineupSlot, opts: EvaluateOptions = {}): Evaluation {
    assertState(st);
    const first = opts.first ?? true;
    const detail = opts.detail ?? true;
    const batSide: Side = st.half === 0 ? 'away' : 'home';
    const slot = batSide === 'away' ? st.slotAway : st.slotHome;
    const batter = teamOf(batSide).lineup[slot];
    const dists = distsFor(batSide, pitcher);
    const pa = matchup(
      batter.rel,
      pitcher.rel,
      lg,
      effectMultipliers(effects, { batterId: batter.id, pitcherId: pitcher.id, batSide, first }, mode),
    );
    const out = [0, 0];

    /** 이 반이닝이 runs점을 더 내고 끝나 다음 선두 타순이 nextSlot일 때 [홈 승, 무승부] */
    const endOfHalf = (runs: number, nextSlot: number) => {
      if (st.half === 0) startBottom(st.inning, st.home - st.away - runs, nextSlot, st.slotHome, out);
      else afterBottom(st.inning, st.home + runs - st.away, st.slotAway, nextSlot, out);
      return out;
    };
    /** 반이닝 분포(이미 runsBefore점을 낸 뒤)에서 [홈 승, 무승부], 추가 무득점 확률, 기대 득점 */
    const valueFrom = (hd: Float64Array, runsBefore: number) => {
      let w = 0;
      let t = 0;
      let p0 = 0;
      let expRuns = 0;
      for (let r = 0; r <= RMAX; r++) {
        for (let s = 0; s < 9; s++) {
          const p = hd[r * 9 + s];
          if (p === 0) continue;
          const v = endOfHalf(Math.min(runsBefore + r, RMAX), s);
          w += p * v[0];
          t += p * v[1];
          if (r === 0) p0 += p;
          expRuns += p * r;
        }
      }
      return { w, t, p0, expRuns };
    };

    const now = valueFrom(halfInning(dists, { slot, outs: st.outs, bases: st.bases }, pa), 0);
    const evaluation: Evaluation = {
      batSide,
      pa,
      batterWin: batterWin(pa),
      pitcherWin: 1 - batterWin(pa),
      inningScore: 1 - now.p0,
      expRuns: now.expRuns,
      winHome: now.w,
      tie: now.t,
      winAway: 1 - now.w - now.t,
      after: [],
      count: null,
    };
    if (!detail) return evaluation;

    const nextSlot = (slot + 1) % 9;
    const memo = new Map<number, Float64Array>();
    for (let e = 0; e < 7; e++) {
      let w = 0;
      let t = 0;
      let score = 0;
      for (const x of transitions(st.bases, st.outs, e as EventIndex)) {
        if (x.outs >= 3) {
          const v = endOfHalf(0, nextSlot);
          w += x.p * v[0];
          t += x.p * v[1];
          continue;
        }
        if (x.runs > 0 && st.half === 1 && st.inning >= 9 && st.home + x.runs > st.away) {
          // 말 공격 중 홈팀이 앞서는 순간 끝내기: 남은 반이닝을 전파하지 않고 정확히 홈 승
          w += x.p;
          score += x.p;
          continue;
        }
        const key = x.outs * 8 + x.bases;
        let hd = memo.get(key);
        if (!hd) {
          hd = halfInning(dists, { slot: nextSlot, outs: x.outs, bases: x.bases });
          memo.set(key, hd);
        }
        const v = valueFrom(hd, x.runs);
        w += x.p * v.w;
        t += x.p * v.t;
        score += x.p * (x.runs > 0 ? 1 : 1 - v.p0);
      }
      evaluation.after.push({ winHome: w, tie: t, winAway: 1 - w - t, inningScore: score });
    }
    evaluation.count = countTable ? calibrateCount(pa, countTable) : null;
    return evaluation;
  }

  return { evaluate };
}

/** 그 볼카운트에서의 게이지: 카운트별 사건 분포로 after를 섞는다 (engine.js 그대로). 카운트 모델이 없으면 Error */
export function gaugesAtCount(
  ev: Evaluation,
  balls: number,
  strikes: number,
): { dist: Float64Array; batterWin: number; inningScore: number; winHome: number; tie: number; winAway: number } {
  if (!ev.count || ev.after.length !== 7) {
    throw new Error('gaugesAtCount: 카운트 모델이 없는 평가다 (countTable 없음 또는 detail: false)');
  }
  const dist = outcomeAtCount(ev.count, ev.pa, balls, strikes);
  let w = 0;
  let t = 0;
  let score = 0;
  for (let e = 0; e < 7; e++) {
    w += dist[e] * ev.after[e].winHome;
    t += dist[e] * ev.after[e].tie;
    score += dist[e] * ev.after[e].inningScore;
  }
  return { dist, batterWin: batterWin(dist), inningScore: score, winHome: w, tie: t, winAway: 1 - w - t };
}

/**
 * 타석 결과 분기를 경기 상태에 반영한다 (app.js applyPlay 그대로): 공격 팀 점수 += runs, 아웃·주자 갱신(3아웃이면 주자 0),
 * 공격 팀 타순 +1, 끝내기·경기 종료·무승부·반이닝 종료 판정. 입력 state는 바꾸지 않는다.
 */
export function applyTransition(state: GameState, tr: Transition): { state: GameState; over: GameOver | null } {
  const st: GameState = { ...state };
  const batSide: Side = st.half === 0 ? 'away' : 'home';
  st[batSide] += tr.runs;
  st.outs = tr.outs;
  st.bases = tr.outs >= 3 ? 0 : tr.bases;
  if (batSide === 'away') st.slotAway = (st.slotAway + 1) % 9;
  else st.slotHome = (st.slotHome + 1) % 9;

  let over: GameOver | null = null;
  if (st.half === 1 && st.inning >= 9 && st.home > st.away) {
    over = { kind: 'game', winner: 'home', walkoff: true };
  } else if (st.outs >= 3) {
    if (st.inning >= 9 && st.half === 0 && st.home > st.away) over = { kind: 'game', winner: 'home', walkoff: false };
    else if (st.inning >= 9 && st.half === 1 && st.away > st.home) over = { kind: 'game', winner: 'away', walkoff: false };
    else if (st.inning >= MAX_INN && st.half === 1) over = { kind: 'game', winner: 'tie', walkoff: false };
    else over = { kind: 'half' };
  }
  return { state: st, over };
}

/** 3아웃 뒤 다음 반이닝 시작 상태: 초 → 같은 이닝 말, 말 → 다음 이닝 초. 아웃·주자 0, 점수·타순 유지 */
export function startNextHalf(state: GameState): GameState {
  if (state.half === 0) return { ...state, half: 1, outs: 0, bases: 0 };
  return { ...state, inning: state.inning + 1, half: 0, outs: 0, bases: 0 };
}
