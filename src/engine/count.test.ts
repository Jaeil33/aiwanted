import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { fixtureAppData } from '../test/fixtures/appData';
import type { EventIndex, PitchCode, PitchSample } from '../types/domain';
import { calibrateCount, countChain, nextCount, outcomeAtCount, simulatePA, type CountModel } from './count';
import { batterWin, matchup } from './matchup';
import { createRng } from './rng';

const LG = fixtureAppData.core.league;
const TABLE = fixtureAppData.core.countTable;
const ONES = [1, 1, 1, 1, 1, 1, 1];
const N = 200_000;

/** 볼 0~3 × 스트라이크 0~2 */
const COUNTS: readonly (readonly [number, number])[] = Array.from({ length: 12 }, (_, c) => [Math.floor(c / 3), c % 3] as const);

const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);

function near(actual: number, expected: number, tol: number, label = '') {
  expect(Math.abs(actual - expected), `${label} ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

/** i번째 사건 비율을 share로 두고 나머지 사건은 원래 비율대로 줄인다 */
function withShare(dist: ArrayLike<number>, i: EventIndex, share: number): Float64Array {
  const rest = 1 - dist[i];
  return Float64Array.from(dist, (x, k) => (k === i ? share : (x * (1 - share)) / rest));
}

const allFinite = (cm: CountModel) => [...cm.rates.flat(), ...cm.term.flat()].every((x) => Number.isFinite(x));

const LEAGUE = matchup(ONES, ONES, LG);

const MATCHUPS: readonly (readonly [string, Float64Array])[] = [
  ['리그 평균', LEAGUE],
  ['삼진형 K 0.35', withShare(LEAGUE, EV.K, 0.35)],
  ['볼넷형 BB 0.18', withShare(LEAGUE, EV.BB, 0.18)],
  ['극단 rel 섞음(0.2·3.0)', matchup([0.2, 3, 0.2, 3, 0.2, 3, 1], [3, 0.2, 3, 0.2, 3, 0.2, 1], LG)],
  ['극단 rel 삼진 대부분', matchup([3, 0.2, 0.2, 3, 0.2, 3, 0.2], [3, 0.2, 1, 1, 1, 1, 1], LG)],
  ['극단 rel 볼넷 절반', matchup([0.2, 3, 1, 1, 1, 1, 1], [0.2, 3, 1, 1, 1, 1, 1], LG)],
  ['극단 rel 삼진·볼넷만', matchup([3, 3, 0.2, 0.2, 0.2, 0.2, 0.2], [3, 3, 1, 1, 1, 1, 1], LG)],
  ['극단 rel 인플레이만', matchup([0.2, 0.2, 3, 3, 3, 3, 3], [0.2, 0.2, 1, 1, 1, 1, 1], LG)],
];

/** 한 타석의 투구 기록이 카운트 규칙을 어기면 이유를, 지키면 null을 돌려준다 */
function ruleViolation(event: EventIndex, pitches: readonly PitchSample[]): string | null {
  let balls = 0;
  let strikes = 0;
  for (let i = 0; i < pitches.length; i++) {
    const p = pitches[i];
    const last = i === pitches.length - 1;
    if (p.balls !== balls || p.strikes !== strikes) return `${i}구 카운트 ${p.balls}-${p.strikes}, 기대 ${balls}-${strikes}`;
    if (p.code === 'B') {
      balls += 1;
      if ((balls === 4) !== last) return `${i}구 볼: 볼넷은 네 번째 볼에서만 끝난다`;
    } else if (p.code === 'T' || p.code === 'S') {
      strikes += 1;
      if ((strikes === 3) !== last) return `${i}구 스트라이크: 삼진은 세 번째 스트라이크에서만 끝난다`;
    } else if (p.code === 'F') {
      if (strikes < 2) strikes += 1;
      if (last) return `${i}구 파울로 타석이 끝났다`;
    } else if (p.code === 'X') {
      if (!last) return `${i}구 인플레이 뒤에 공이 더 있다`;
    } else {
      return `${i}구 알 수 없는 코드 ${String(p.code)}`;
    }
  }
  const end = pitches.at(-1)?.code;
  const ok = event === EV.K ? end === 'T' || end === 'S' : event === EV.BB ? end === 'B' : end === 'X';
  return ok ? null : `사건 ${event}와 마지막 공 ${String(end)}가 맞지 않는다`;
}

describe('countChain', () => {
  it('배율이 모두 1이면 rates는 카운트 표의 각 행을 합 1로 정규화한 값이다', () => {
    const cm = countChain(TABLE, 1, 1, 1);
    expect(cm.rates).toHaveLength(12);
    expect(cm.term).toHaveLength(12);
    TABLE.forEach((row, c) => {
      const total = sum(row);
      row.forEach((x, k) => near(cm.rates[c][k], x / total, 1e-12, `rates[${c}][${k}]`));
    });
  });

  it('볼 배율은 B, 스트라이크 배율은 T·S, 인플레이 배율은 X에 곱하고 파울은 그대로 둔다', () => {
    const cm = countChain(TABLE, 1.7, 0.6, 1.2);
    TABLE.forEach((row, c) => {
      const raw = [row[0] * 1.7, row[1] * 0.6, row[2] * 0.6, row[3], row[4] * 1.2];
      const total = sum(raw);
      raw.forEach((x, k) => near(cm.rates[c][k], x / total, 1e-12, `rates[${c}][${k}]`));
    });
  });

  it('term은 카운트마다 [K, BB, 인플레이] 흡수 확률로 합이 1이고 한 구 진행 규칙을 만족한다', () => {
    const cm = countChain(TABLE, 1.3, 0.8, 1);
    for (const [b, s] of COUNTS) {
      const c = b * 3 + s;
      const [pB, pT, pS, pF, pX] = cm.rates[c];
      const t = cm.term[c];
      near(sum(t), 1, 1e-12, `${b}-${s} 합`);
      // 3볼에서 볼이면 볼넷, 2스트라이크에서 T·S면 삼진, 2스트라이크 파울은 카운트 유지
      const onBall = b === 3 ? [0, 1, 0] : cm.term[(b + 1) * 3 + s];
      const onStrike = s === 2 ? [1, 0, 0] : cm.term[c + 1];
      const onFoul = s === 2 ? t : cm.term[c + 1];
      const inPlay = [0, 0, 1];
      for (let k = 0; k < 3; k++) {
        const expected = pB * onBall[k] + (pT + pS) * onStrike[k] + pF * onFoul[k] + pX * inPlay[k];
        near(t[k], expected, 1e-12, `${b}-${s} term[${k}]`);
      }
    }
  });

  it('손으로 계산한 표와 같다: 볼넷 (1/2)⁴, 삼진 0.75² × 0.25 / (1 − 0.5)', () => {
    const walks = countChain(Array.from({ length: 12 }, () => [0.5, 0, 0, 0, 0.5]), 1, 1, 1);
    expect(walks.term[0]).toEqual([0, 1 / 16, 15 / 16]);
    const strikeouts = countChain(Array.from({ length: 12 }, () => [0, 0.25, 0, 0.5, 0.25]), 1, 1, 1);
    expect(strikeouts.term[0]).toEqual([0.28125, 0, 0.71875]);
    expect(strikeouts.term[2]).toEqual([0.5, 0, 0.5]);
  });
});

describe('calibrateCount', () => {
  it.each(MATCHUPS)('%s: 0-0의 K·BB 흡수 확률이 pa와 1e-9 이내이고 NaN이 없다', (_label, pa) => {
    const cm = calibrateCount(pa, TABLE);
    near(cm.term[0][0], pa[EV.K], 1e-9, 'K');
    near(cm.term[0][1], pa[EV.BB], 1e-9, 'BB');
    expect(allFinite(cm)).toBe(true);
  });

  it.each(MATCHUPS)('%s: 볼·스트라이크 배율 두 개만 조정하고 파울·인플레이 비율은 표 그대로 둔다', (_label, pa) => {
    const cm = calibrateCount(pa, TABLE);
    const scales = TABLE.map((row, c) => {
      const foul = cm.rates[c][3] / row[3];
      return {
        ball: cm.rates[c][0] / row[0] / foul,
        called: cm.rates[c][1] / row[1] / foul,
        swinging: cm.rates[c][2] / row[2] / foul,
        play: cm.rates[c][4] / row[4] / foul,
      };
    });
    for (const x of scales) {
      near(x.play, 1, 1e-9, '인플레이 배율 1');
      near(x.ball / scales[0].ball, 1, 1e-9, '볼 배율은 카운트마다 같다');
      near(x.called / scales[0].called, 1, 1e-9, '스트라이크 배율은 카운트마다 같다');
      near(x.swinging / x.called, 1, 1e-9, '루킹·헛스윙은 같은 스트라이크 배율');
    }
  });
});

describe('outcomeAtCount', () => {
  it.each(MATCHUPS)('%s: 모든 카운트에서 사건 분포 합이 1이고 0-0 분포는 pa와 같다', (_label, pa) => {
    const cm = calibrateCount(pa, TABLE);
    for (const [b, s] of COUNTS) near(sum(outcomeAtCount(cm, pa, b, s)), 1, 1e-9, `${b}-${s}`);
    const start = outcomeAtCount(cm, pa, 0, 0);
    pa.forEach((x, i) => near(start[i], x, 1e-9, `사건 ${i}`));
  });

  it.each(MATCHUPS)('%s: 타자 출루 확률은 3-0 > 0-0 > 0-2', (_label, pa) => {
    const cm = calibrateCount(pa, TABLE);
    const win = (b: number, s: number) => batterWin(outcomeAtCount(cm, pa, b, s));
    expect(win(3, 0)).toBeGreaterThan(win(0, 0));
    expect(win(0, 0)).toBeGreaterThan(win(0, 2));
  });

  it('K·BB는 term 값, 인플레이 몫은 pa의 인플레이 사건 비율대로 나눈다', () => {
    const pa = MATCHUPS[3][1];
    const cm = calibrateCount(pa, TABLE);
    const out = outcomeAtCount(cm, pa, 2, 1);
    const t = cm.term[2 * 3 + 1];
    expect(out).toBeInstanceOf(Float64Array);
    near(out[EV.K], t[0], 1e-15, 'K');
    near(out[EV.BB], t[1], 1e-15, 'BB');
    const play = pa[2] + pa[3] + pa[4] + pa[5] + pa[6];
    for (let i = 2; i < 7; i++) near(out[i], (t[2] * pa[i]) / play, 1e-15, `사건 ${i}`);
  });

  it.each([
    [4, 0],
    [0, 3],
    [-1, 0],
    [1.5, 0],
  ])('범위를 벗어난 카운트 %s-%s는 RangeError', (b, s) => {
    const cm = calibrateCount(LEAGUE, TABLE);
    expect(() => outcomeAtCount(cm, LEAGUE, b, s)).toThrow(RangeError);
  });
});

describe('simulatePA', () => {
  it('고정 seed 20만 타석의 사건 빈도가 pa와 3σ 이내', () => {
    const pa = matchup(ONES, [1.3, 0.8, 0.9, 1, 1, 1, 1], LG);
    const cm = calibrateCount(pa, TABLE);
    const r = createRng(11);
    const counts = new Array<number>(7).fill(0);
    for (let n = 0; n < N; n++) counts[simulatePA(cm, pa, r).event] += 1;
    pa.forEach((p, i) => near(counts[i] / N, p, 3 * Math.sqrt((p * (1 - p)) / N), `사건 ${i}`));
  });

  it('20만 타석의 모든 투구 기록이 카운트 규칙을 지킨다(각 공의 카운트는 던지기 전 카운트)', () => {
    const pa = MATCHUPS[6][1];
    const cm = calibrateCount(pa, TABLE);
    const r = createRng(29);
    const violations: string[] = [];
    const seen = { walk: 0, strikeout: 0, inPlay: 0, twoStrikeFoul: 0 };
    for (let n = 0; n < N; n++) {
      const { event, pitches } = simulatePA(cm, pa, r);
      const bad = ruleViolation(event, pitches);
      if (bad !== null && violations.length < 5) violations.push(`${n}번째 타석: ${bad}`);
      if (event === EV.BB) seen.walk += 1;
      else if (event === EV.K) seen.strikeout += 1;
      else seen.inPlay += 1;
      if (pitches.some((p) => p.code === 'F' && p.strikes === 2)) seen.twoStrikeFoul += 1;
    }
    expect(violations).toEqual([]);
    expect(Object.values(seen).every((x) => x > 0), JSON.stringify(seen)).toBe(true);
  });

  it('같은 seed면 같은 투구 기록을 낸다', () => {
    const cm = calibrateCount(LEAGUE, TABLE);
    const run = (seed: number) => {
      const r = createRng(seed);
      return Array.from({ length: 300 }, () => simulatePA(cm, LEAGUE, r));
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });
});

describe('nextCount', () => {
  it.each([
    ['3-2 볼 → 볼넷', 3, 2, 'B', { balls: 4, strikes: 2, ends: 'BB' }],
    ['0-2 파울 → 0-2 유지', 0, 2, 'F', { balls: 0, strikes: 2, ends: null }],
    ['1-2 헛스윙 → 삼진', 1, 2, 'S', { balls: 1, strikes: 3, ends: 'K' }],
    ['1-1 루킹 → 1-2', 1, 1, 'T', { balls: 1, strikes: 2, ends: null }],
    ['2-1 인플레이 → X', 2, 1, 'X', { balls: 2, strikes: 1, ends: 'X' }],
    ['0-0 볼 → 1-0', 0, 0, 'B', { balls: 1, strikes: 0, ends: null }],
    ['0-1 파울 → 0-2', 0, 1, 'F', { balls: 0, strikes: 2, ends: null }],
    ['2-2 루킹 → 삼진', 2, 2, 'T', { balls: 2, strikes: 3, ends: 'K' }],
    ['3-0 헛스윙 → 3-1', 3, 0, 'S', { balls: 3, strikes: 1, ends: null }],
  ] as const)('%s', (_label, balls, strikes, code, expected) => {
    expect(nextCount(balls, strikes, code)).toEqual(expected);
  });

  it('범위를 벗어난 카운트나 알 수 없는 공 결과는 RangeError', () => {
    expect(() => nextCount(4, 0, 'B')).toThrow(RangeError);
    expect(() => nextCount(0, 3, 'F')).toThrow(RangeError);
    expect(() => nextCount(0, 0, 'Z' as PitchCode)).toThrow(RangeError);
  });
});
