import { EV } from '../domain/events';
import type { Bases, EventIndex, Play, RunnerMove, Transition } from '../types/domain';

/*
 * 주루 분기표: 프로토타입 engine.js buildTransitions를 그대로 옮겼다.
 * 주루·병살 확률 상수는 ADR-002에 따라 바꾸지 않는다.
 * moves: [출발, 도착], 출발 0=타자·1~3=루 / 도착 1~3=루·4=득점·-1=아웃
 */
function buildTransitions(bases: Bases, outs: number, e: EventIndex): Transition[] {
  const b1 = bases & 1;
  const b2 = (bases >> 1) & 1;
  const b3 = (bases >> 2) & 1;
  const list: Transition[] = [];
  const add = (p: number, n1: number, n2: number, n3: number, o: number, runs: number, play: Play, moves: RunnerMove[]) => {
    if (p <= 0) return;
    if (o >= 3) list.push({ p, bases: 0, outs: 3, runs: 0, play, moves });
    else list.push({ p, bases: n1 | (n2 << 1) | (n3 << 2), outs: o, runs, play, moves });
  };
  const runnersTo = (to: number): RunnerMove[] =>
    [3, 2, 1].filter((from) => (bases >> (from - 1)) & 1).map((from): RunnerMove => [from, to]);

  if (e === EV.K) {
    add(1, b1, b2, b3, outs + 1, 0, 'K', [[0, -1]]);
  } else if (e === EV.BB) {
    const moves: RunnerMove[] = [[0, 1]];
    if (b1) moves.push([1, 2]);
    if (b1 && b2) moves.push([2, 3]);
    if (b1 && b2 && b3) moves.push([3, 4]);
    add(1, 1, b2 | b1, b3 | (b1 & b2), outs, b1 & b2 & b3, 'BB', moves);
  } else if (e === EV.HR) {
    add(1, 0, 0, 0, outs, b1 + b2 + b3 + 1, 'HR', [...runnersTo(4), [0, 4]]);
  } else if (e === EV.T3) {
    add(1, 0, 0, 1, outs, b1 + b2 + b3, '3B', [...runnersTo(4), [0, 3]]);
  } else if (e === EV.D2) {
    const moves: RunnerMove[] = [[0, 2]];
    if (b3) moves.push([3, 4]);
    if (b2) moves.push([2, 4]);
    if (b1) {
      add(0.45, 0, 1, 0, outs, b2 + b3 + 1, '2B', [...moves, [1, 4]]);
      add(0.55, 0, 1, 1, outs, b2 + b3, '2B', [...moves, [1, 3]]);
    } else {
      add(1, 0, 1, 0, outs, b2 + b3, '2B', moves);
    }
  } else if (e === EV.S1) {
    const base: RunnerMove[] = [[0, 1]];
    if (b3) base.push([3, 4]);
    const fromSecond = b2 ? [[0.62, 1], [0.38, 0]] : [[1, 0]];
    for (const [p2, scored] of fromSecond) {
      const onThird = b2 && !scored ? 1 : 0;
      const moves: RunnerMove[] = b2 ? [...base, [2, scored ? 4 : 3]] : base;
      const runs = b3 + (b2 && scored ? 1 : 0);
      if (!b1) add(p2, 1, 0, onThird, outs, runs, '1B', moves);
      else if (onThird) add(p2, 1, 1, 1, outs, runs, '1B', [...moves, [1, 2]]);
      else {
        add(p2 * 0.28, 1, 0, 1, outs, runs, '1B', [...moves, [1, 3]]);
        add(p2 * 0.72, 1, 1, 0, outs, runs, '1B', [...moves, [1, 2]]);
      }
    }
  } else {
    const GB = 0.46;
    const FB = 0.36;
    const LD = 0.18;
    let groundOut = GB;
    if (b1 && outs < 2) {
      groundOut = GB * 0.55;
      const moves: RunnerMove[] = [[0, -1], [1, -1]];
      if (b2) moves.push([2, 3]);
      if (b3) moves.push([3, 4]);
      add(GB * 0.45, 0, 0, b2, outs + 2, b3, 'DP', moves);
    }
    if (outs + 1 >= 3) {
      add(groundOut, 0, 0, 0, 3, 0, 'GB', [[0, -1]]);
      add(FB, 0, 0, 0, 3, 0, 'FB', [[0, -1]]);
      add(LD, 0, 0, 0, 3, 0, 'LD', [[0, -1]]);
    } else {
      for (const [p3, scored] of b3 ? [[0.5, 1], [0.5, 0]] : [[1, 0]]) {
        const held = b3 && !scored ? 1 : 0;
        for (const [p2, toThird] of b2 && !held ? [[0.6, 1], [0.4, 0]] : [[1, 0]]) {
          let n1 = 0;
          let n2 = 0;
          let n3 = held;
          const moves: RunnerMove[] = [[0, -1]];
          if (b3) moves.push([3, scored ? 4 : 3]);
          if (b2) {
            if (toThird) {
              n3 = 1;
              moves.push([2, 3]);
            } else {
              n2 = 1;
              moves.push([2, 2]);
            }
          }
          if (b1) {
            if (!n2) {
              n2 = 1;
              moves.push([1, 2]);
            } else {
              n1 = 1;
              moves.push([1, 1]);
            }
          }
          add(groundOut * p3 * p2, n1, n2, n3, outs + 1, scored, 'GB', moves);
        }
      }
      for (const [p3, scored] of b3 ? [[0.55, 1], [0.45, 0]] : [[1, 0]]) {
        const held = b3 && !scored ? 1 : 0;
        for (const [p2, tag] of b2 && !held ? [[0.25, 1], [0.75, 0]] : [[1, 0]]) {
          const moves: RunnerMove[] = [[0, -1]];
          if (b3) moves.push([3, scored ? 4 : 3]);
          if (b2) moves.push([2, tag ? 3 : 2]);
          if (b1) moves.push([1, 1]);
          add(FB * p3 * p2, b1, b2 && !tag ? 1 : 0, held | tag, outs + 1, scored, scored ? 'SF' : 'FB', moves);
        }
      }
      add(LD, b1, b2, b3, outs + 1, 0, 'LD', [[0, -1]]);
    }
  }
  return list;
}

/** 표는 모든 호출이 공유하므로 얼려서 바깥에서 바꾸지 못하게 한다 */
function freezeList(list: Transition[]): readonly Transition[] {
  for (const x of list) {
    for (const move of x.moves) Object.freeze(move);
    Object.freeze(x.moves);
    Object.freeze(x);
  }
  return Object.freeze(list);
}

/** 인덱스 (outs × 8 + bases) × 7 + 사건 */
const TABLE: readonly (readonly Transition[])[] = (() => {
  const table: (readonly Transition[])[] = [];
  for (let o = 0; o < 3; o++) {
    for (let b = 0; b < 8; b++) {
      for (let e = 0; e < 7; e++) table.push(freezeList(buildTransitions(b, o, e as EventIndex)));
    }
  }
  return table;
})();

const inRange = (x: number, size: number) => Number.isInteger(x) && x >= 0 && x < size;

/** (bases, outs)에서 사건 e가 났을 때의 주루 분기 목록 (사전 계산 표, 확률 합 1) */
export function transitions(bases: Bases, outs: number, e: EventIndex): readonly Transition[] {
  if (!inRange(bases, 8) || !inRange(outs, 3) || !inRange(e, 7)) {
    throw new RangeError(`transitions: bases 0~7, outs 0~2, 사건 0~6이어야 한다 (bases ${bases}, outs ${outs}, e ${e})`);
  }
  return TABLE[(outs * 8 + bases) * 7 + e];
}

/** 사건 분포에서 사건 하나를 뽑는다 */
export function sampleEvent(dist: ArrayLike<number>, r: () => number): EventIndex {
  let u = r();
  for (let i = 0; i < 6; i++) {
    if (u < dist[i]) return i as EventIndex;
    u -= dist[i];
  }
  return EV.OUT;
}

/** 인플레이 사건(HR·3B·2B·1B·OUT)만 pa의 인플레이 비율대로 뽑는다 */
export function sampleInPlay(pa: ArrayLike<number>, r: () => number): EventIndex {
  let u = r() * (pa[2] + pa[3] + pa[4] + pa[5] + pa[6]);
  for (let i = 2; i < 6; i++) {
    if (u < pa[i]) return i as EventIndex;
    u -= pa[i];
  }
  return EV.OUT;
}

/** 주루 분기 하나를 확률대로 뽑는다 (표의 객체 자체를 돌려준다) */
export function sampleTransition(bases: Bases, outs: number, e: EventIndex, r: () => number): Transition {
  const list = transitions(bases, outs, e);
  let u = r();
  for (let k = 0; k < list.length - 1; k++) {
    if (u < list[k].p) return list[k];
    u -= list[k].p;
  }
  return list[list.length - 1];
}
