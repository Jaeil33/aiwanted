import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { fixtureAppData } from '../test/fixtures/appData';
import type { Bases, EventIndex, Transition } from '../types/domain';
import { matchup } from './matchup';
import { createRng } from './rng';
import { sampleEvent, sampleInPlay, sampleTransition, transitions } from './transitions';

const LG = fixtureAppData.core.league;
const EVENTS: readonly EventIndex[] = [0, 1, 2, 3, 4, 5, 6];
const N = 200_000;

const onBase = (m: Bases) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

function forEachCase(fn: (outs: number, bases: Bases, e: EventIndex) => void) {
  for (let outs = 0; outs < 3; outs++) {
    for (let bases = 0; bases < 8; bases++) {
      for (const e of EVENTS) fn(outs, bases, e);
    }
  }
}

/** moves를 동시에 적용한다: 출발 루(1~3)에서 모두 빼고 도착 루(1~3)에 놓는다. moves에 없는 주자는 제자리 */
function applyMoves(bases: Bases, moves: Transition['moves']): Bases {
  let next = bases;
  for (const [from] of moves) if (from >= 1 && from <= 3) next &= ~(1 << (from - 1));
  for (const [, to] of moves) if (to >= 1 && to <= 3) next |= 1 << (to - 1);
  return next;
}

/** 빈도가 확률과 3σ 이내인지 확인한다 */
function expectWithin3Sigma(counts: readonly number[], probs: ArrayLike<number>, n: number) {
  expect(counts).toHaveLength(probs.length);
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    const sigma = Math.sqrt((p * (1 - p)) / n);
    const freq = counts[i] / n;
    expect(Math.abs(freq - p), `index ${i}: ${freq} vs ${p} (3σ ${3 * sigma})`).toBeLessThanOrEqual(3 * sigma);
  }
}

describe('transitions', () => {
  it('모든 (outs, bases, 사건)에서 분기 확률은 양수이고 합이 1', () => {
    forEachCase((outs, bases, e) => {
      const list = transitions(bases, outs, e);
      expect(list.length, `${outs}/${bases}/${e}`).toBeGreaterThan(0);
      let total = 0;
      for (const x of list) {
        expect(x.p, `${outs}/${bases}/${e}`).toBeGreaterThan(0);
        total += x.p;
      }
      expect(Math.abs(total - 1), `${outs}/${bases}/${e}`).toBeLessThanOrEqual(1e-12);
    });
  });

  it('3아웃이 아닌 모든 분기에서 주자를 보존한다', () => {
    forEachCase((outs, bases, e) => {
      for (const x of transitions(bases, outs, e)) {
        if (x.outs >= 3) continue;
        expect(onBase(bases) + 1, `${outs}/${bases}/${e} ${x.play}`).toBe(onBase(x.bases) + x.runs + (x.outs - outs));
      }
    });
  });

  it('3아웃 분기는 득점 0, 주자 0', () => {
    let seen = 0;
    forEachCase((outs, bases, e) => {
      for (const x of transitions(bases, outs, e)) {
        if (x.outs < 3) continue;
        seen += 1;
        expect([x.outs, x.bases, x.runs], `${outs}/${bases}/${e} ${x.play}`).toEqual([3, 0, 0]);
      }
    });
    expect(seen).toBeGreaterThan(0);
  });

  it('moves를 동시에 적용한 결과가 bases와 같고, 득점·아웃 수와 맞는다', () => {
    forEachCase((outs, bases, e) => {
      for (const x of transitions(bases, outs, e)) {
        const at = `${outs}/${bases}/${e} ${x.play}`;
        expect(x.moves.filter(([from]) => from === 0), at).toHaveLength(1);
        for (const [from] of x.moves) {
          if (from >= 1) expect((bases >> (from - 1)) & 1, `${at} 출발 루 ${from}에 주자가 있다`).toBe(1);
        }
        if (x.outs >= 3) continue;
        const landed = x.moves.map(([, to]) => to).filter((to) => to >= 1 && to <= 3);
        expect(new Set(landed).size, `${at} 도착 루가 겹치지 않는다`).toBe(landed.length);
        expect(applyMoves(bases, x.moves), at).toBe(x.bases);
        expect(x.moves.filter(([, to]) => to === 4), at).toHaveLength(x.runs);
        expect(x.moves.filter(([, to]) => to === -1), at).toHaveLength(x.outs - outs);
      }
    });
  });

  it('만루 볼넷은 밀어내기 1점, 홈런은 주자를 모두 불러들인다', () => {
    const [walk] = transitions(0b111, 1, EV.BB);
    expect([walk.bases, walk.outs, walk.runs, walk.play]).toEqual([0b111, 1, 1, 'BB']);
    const [homer] = transitions(0b001, 0, EV.HR);
    expect([homer.bases, homer.outs, homer.runs, homer.play]).toEqual([0, 0, 2, 'HR']);
  });

  it('주자 1루 무사 범타는 병살 분기를 포함한다', () => {
    const plays = transitions(0b001, 0, EV.OUT).map((x) => x.play);
    expect(plays).toContain('DP');
    const dp = transitions(0b001, 0, EV.OUT).find((x) => x.play === 'DP');
    expect(dp).toMatchObject({ bases: 0, outs: 2, runs: 0 });
  });

  it('같은 입력에는 미리 계산한 같은 표를 돌려준다', () => {
    expect(transitions(3, 1, EV.OUT)).toBe(transitions(3, 1, EV.OUT));
  });

  it('공유 표는 얼려 있어 바깥에서 바꿀 수 없다', () => {
    const list = transitions(0b011, 0, EV.OUT);
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list[0])).toBe(true);
    expect(Object.isFrozen(list[0].moves)).toBe(true);
  });

  it.each([
    ['아웃 3', 0, 3],
    ['아웃 −1', 0, -1],
    ['주자 비트 8', 8, 0],
    ['정수가 아닌 주자', 0.5, 0],
  ])('범위를 벗어난 상태는 RangeError: %s', (_label, bases, outs) => {
    expect(() => transitions(bases, outs, EV.K)).toThrow(RangeError);
  });
});

describe('샘플러', () => {
  it('sampleEvent: 고정 seed로 20만 번 뽑은 빈도가 분포와 3σ 이내', () => {
    const dist = matchup([0.8, 1.2, 2, 1, 1.2, 1, 0.9], [1.3, 0.8, 0.9, 1, 1, 1, 1], LG);
    const r = createRng(11);
    const counts = new Array<number>(7).fill(0);
    for (let n = 0; n < N; n++) counts[sampleEvent(dist, r)] += 1;
    expectWithin3Sigma(counts, dist, N);
  });

  it('sampleInPlay: 인플레이 사건(HR~OUT)만 인플레이 비율대로 뽑는다', () => {
    const pa = matchup([0.9, 1, 1.6, 1, 1.2, 1, 0.95], [1.15, 0.9, 0.85, 1, 0.95, 0.95, 1], LG);
    const play = pa[2] + pa[3] + pa[4] + pa[5] + pa[6];
    const probs = Array.from(pa, (x, i) => (i < 2 ? 0 : x / play));
    const r = createRng(23);
    const counts = new Array<number>(7).fill(0);
    for (let n = 0; n < N; n++) counts[sampleInPlay(pa, r)] += 1;
    expect(counts[EV.K] + counts[EV.BB]).toBe(0);
    expectWithin3Sigma(counts, probs, N);
  });

  it.each([
    ['1·2루 무사 범타', 0b011, 0, EV.OUT],
    ['2루 1사 안타', 0b010, 1, EV.S1],
    ['만루 무사 범타', 0b111, 0, EV.OUT],
  ] as const)('sampleTransition: %s 분기 빈도가 확률과 3σ 이내', (_label, bases, outs, e) => {
    const list = transitions(bases, outs, e);
    expect(list.length).toBeGreaterThan(1);
    const r = createRng(bases * 10 + outs + 101);
    const counts = new Array<number>(list.length).fill(0);
    for (let n = 0; n < N; n++) {
      const k = list.indexOf(sampleTransition(bases, outs, e, r));
      expect(k).toBeGreaterThanOrEqual(0);
      counts[k] += 1;
    }
    expectWithin3Sigma(
      counts,
      list.map((x) => x.p),
      N,
    );
  });
});
