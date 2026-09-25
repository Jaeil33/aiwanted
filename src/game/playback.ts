import { PITCH_CODES } from '../domain/events';
import { EV, applyTransition, nextCount, sampleInPlay, sampleTransition, transitions, type Evaluation } from '../engine';
import type { PitchPlayback, StageScene } from '../stage/render/types';
import type { AppData, PitchRow } from '../types/data';
import type { EventIndex, GameOver, GameState, PitchCode, Side, Transition } from '../types/domain';
import { batterFor, nameOf, pitcherFor, throwsOf, type SituationSetup } from './situation';
import type { PlayLogEntry } from './session';

/*
 * 한 구씩 다시 치르기: 공 결과·타석 결과는 엔진 평가(count·pa)와 주루 분기표에서 인자로 받은 난수 r로만 뽑는다.
 * 연출 명령(PitchPlayback)은 스테이지가 그대로 그린다.
 */

/** 끝난 타석: 사건과 주루 분기 */
export interface PaEnd {
  event: EventIndex;
  transition: Transition;
}

const isCount = (balls: number, strikes: number) =>
  Number.isInteger(balls) && balls >= 0 && balls <= 3 && Number.isInteger(strikes) && strikes >= 0 && strikes <= 2;

/** 그 카운트의 한 구 결과를 ev.count.rates[balls*3+strikes] 누적 확률로 뽑는다 (engine simulatePA와 같은 구간). count가 없으면 Error */
export function samplePitchCode(ev: Evaluation, balls: number, strikes: number, r: () => number): PitchCode {
  if (!ev.count) throw new Error('samplePitchCode: 카운트 모델이 없는 평가다 (countTable 없음 또는 detail: false)');
  if (!isCount(balls, strikes)) throw new RangeError(`samplePitchCode: 볼 0~3, 스트라이크 0~2여야 한다 (${balls}-${strikes})`);
  const q = ev.count.rates[balls * 3 + strikes];
  const u = r();
  if (u < q[0]) return 'B';
  if (u < q[0] + q[1]) return 'T';
  if (u < q[0] + q[1] + q[2]) return 'S';
  if (u < q[0] + q[1] + q[2] + q[3]) return 'F';
  return 'X';
}

/**
 * 공 하나를 반영한다: nextCount의 카운트와 종료(ends)를 그대로 쓴다.
 * K·BB는 표의 첫 분기, X는 sampleInPlay(ev.pa) → sampleTransition 순서로 난수 두 개를 쓴다. 타석이 이어지면 난수를 쓰지 않는다.
 */
export function resolvePitch(
  ev: Evaluation,
  state: GameState,
  balls: number,
  strikes: number,
  code: PitchCode,
  r: () => number,
): { balls: number; strikes: number; ended: PaEnd | null } {
  const next = nextCount(balls, strikes, code);
  const counts = { balls: next.balls, strikes: next.strikes };
  switch (next.ends) {
    case 'K':
      return { ...counts, ended: { event: EV.K, transition: transitions(state.bases, state.outs, EV.K)[0] } };
    case 'BB':
      return { ...counts, ended: { event: EV.BB, transition: transitions(state.bases, state.outs, EV.BB)[0] } };
    case 'X': {
      const event = sampleInPlay(ev.pa, r);
      return { ...counts, ended: { event, transition: sampleTransition(state.bases, state.outs, event, r) } };
    }
    default:
      return { ...counts, ended: null };
  }
}

/** 카운트 유형 (app.js countBucket): 볼·스트라이크 같음 0, 볼 우세 1, 스트라이크 우세 2, 2스트라이크면 +10 */
export function countBucket(balls: number, strikes: number): number {
  return (balls > strikes ? 1 : balls < strikes ? 2 : 0) + (strikes === 2 ? 10 : 0);
}

/**
 * 연출할 실제 투구 행 (app.js pickPitch): 같은 결과·타석 방향·카운트 유형 → 같은 결과·방향 → 같은 결과 → 아무거나.
 * 처음으로 비지 않은 후보에서 난수 하나로 고른다. 행이 없으면 null.
 */
export function pickPitchRow(
  rows: readonly PitchRow[],
  code: PitchCode,
  balls: number,
  strikes: number,
  stance: 'L' | 'R',
  r: () => number,
): PitchRow | null {
  const codeIndex = PITCH_CODES.indexOf(code);
  const stanceIndex = stance === 'L' ? 0 : 1;
  const want = countBucket(balls, strikes);
  const tiers: Array<(row: PitchRow) => boolean> = [
    (row) => row[2] === codeIndex && row[5] === stanceIndex && countBucket(row[3], row[4]) === want,
    (row) => row[2] === codeIndex && row[5] === stanceIndex,
    (row) => row[2] === codeIndex,
    () => true,
  ];
  for (const ok of tiers) {
    const pool = rows.filter(ok);
    if (pool.length > 0) return pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))];
  }
  return null;
}

/** 투수의 투구 표본: pitches.byPitcher[id], 없거나 비었으면 투수 손 기준 리그 표본 */
export function pitchRowsFor(data: AppData, pitcherId: string, throws: 'L' | 'R'): readonly PitchRow[] {
  const { byPitcher, pools } = data.pitches;
  const own = Object.hasOwn(byPitcher, pitcherId) ? byPitcher[pitcherId] : undefined;
  return own && own.length > 0 ? own : pools[throws];
}

/** 타석 결과 한 줄 (app.js headline): "끝내기 만루 홈런!", "밀어내기 볼넷", "병살타", "2타점 적시타" … */
export function headline(event: EventIndex, transition: Transition, over: GameOver | null): string {
  const walkoff = over?.kind === 'game' && over.walkoff;
  const pre = walkoff ? '끝내기 ' : '';
  const bang = walkoff ? '!' : '';
  const { runs, play } = transition;
  if (event === EV.K) return '삼진';
  if (event === EV.BB) return runs ? `${pre}밀어내기 볼넷${bang}` : '볼넷';
  if (event === EV.HR) return runs === 4 ? `${pre}만루 홈런!` : runs === 1 ? `${pre}솔로 홈런!` : `${pre}${runs}점 홈런!`;
  if (event === EV.T3 || event === EV.D2 || event === EV.S1) {
    const label = event === EV.T3 ? '3루타' : event === EV.D2 ? '2루타' : '안타';
    if (walkoff) return `끝내기 ${label}!`;
    if (runs) return `${runs}타점 ${event === EV.S1 ? '적시타' : label}`;
    return label;
  }
  if (play === 'DP') return '병살타';
  if (play === 'SF') return `${pre}희생플라이${bang}`;
  if (play === 'GB') return runs ? `${pre}땅볼 타점${bang}` : '땅볼 아웃';
  if (play === 'FB') return '뜬공 아웃';
  return '직선타 아웃';
}

const batSideOf = (state: GameState): Side => (state.half === 0 ? 'away' : 'home');

/** 스테이지에 세울 두 팀: 공격(팀 색·홈 여부·타자 타석 방향)과 수비(팀 색·홈 여부·투수 손, 없으면 R) */
export function stageSceneFor(setup: SituationSetup, state: GameState): StageScene {
  const batSide = batSideOf(state);
  const fieldSide: Side = batSide === 'away' ? 'home' : 'away';
  return {
    bat: { color: setup.teamColors[batSide], home: batSide === 'home', bats: batterFor(setup, state).stance },
    fld: { color: setup.teamColors[fieldSide], home: fieldSide === 'home', throws: throwsOf(setup, pitcherFor(setup, state).id) },
  };
}

/**
 * 공 하나의 연출 명령. 투구 행은 그 상태 투수의 표본에서 pickPitchRow(r)로 고르고, bats는 stageSceneFor와 같은 타석 방향이다.
 * 타석이 끝났으면 주자 이동·타석 뒤 주자·배너(홈런·끝내기·2점 이상이면 big)를 붙인다. play는 인플레이로 끝났을 때만.
 */
export function playbackFor(args: {
  setup: SituationSetup;
  data: AppData;
  state: GameState;
  code: PitchCode;
  balls: number;
  strikes: number;
  number: number;
  ended: PaEnd | null;
  over: GameOver | null;
  fast: boolean;
  r: () => number;
}): PitchPlayback {
  const { setup, data, state, code, balls, strikes, number, ended, over, fast, r } = args;
  const pitcher = pitcherFor(setup, state);
  const bats = batterFor(setup, state).stance;
  const rows = pitchRowsFor(data, pitcher.id, throwsOf(setup, pitcher.id));
  const playback: PitchPlayback = {
    row: pickPitchRow(rows, code, balls, strikes, bats, r),
    code,
    number,
    fast,
    bats,
    play: ended && code === 'X' ? ended.transition.play : null,
  };
  if (ended) {
    const big = ended.event === EV.HR || (over?.kind === 'game' && over.walkoff) || ended.transition.runs >= 2;
    playback.moves = ended.transition.moves;
    playback.basesAfter = applyTransition(state, ended.transition).state.bases;
    playback.banner = { text: headline(ended.event, ended.transition, over), tone: big ? 'big' : 'normal' };
  }
  return playback;
}

/** 끝난 타석 기록 한 줄: 이닝·초말은 타석 전(before), 점수는 타석 뒤(after) */
export function logEntryFor(args: {
  setup: SituationSetup;
  index: number;
  before: GameState;
  after: GameState;
  batterId: string;
  pitcherId: string;
  headline: string;
  wpHomeAfter: number | null;
  highlight: boolean;
}): PlayLogEntry {
  const { setup, before, after } = args;
  return {
    index: args.index,
    inning: before.inning,
    half: before.half,
    batterName: nameOf(setup, args.batterId),
    pitcherName: nameOf(setup, args.pitcherId),
    headline: args.headline,
    score: { away: after.away, home: after.home },
    wpHomeAfter: args.wpHomeAfter,
    highlight: args.highlight,
  };
}
