import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { fixtureAppData } from '../test/fixtures/appData';
import { batterWin, matchup } from './matchup';

const LG = fixtureAppData.core.league;
const ONES = [1, 1, 1, 1, 1, 1, 1];

const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);

function near(actual: number, expected: number, tol: number, label = '') {
  expect(Math.abs(actual - expected), `${label} ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

describe('matchup', () => {
  it('rel이 모두 1이고 배수가 없으면 리그 분포와 같다', () => {
    const p = matchup(ONES, ONES, LG);
    expect(p).toBeInstanceOf(Float64Array);
    expect(p).toHaveLength(7);
    near(sum(p), 1, 1e-12, '합');
    const total = sum(LG);
    LG.forEach((x, i) => near(p[i], x / total, 1e-12, `사건 ${i}`));
  });

  it('bRel × pRel × lg × 배수를 합 1로 정규화한다', () => {
    const bRel = [0.8, 1.2, 2, 1, 1.2, 1, 0.9];
    const pRel = [1.3, 0.8, 0.9, 1, 1, 1, 1];
    const mult = [1.1, 1, 0.7, 1, 1.05, 1, 0.95];
    const raw = LG.map((x, i) => bRel[i] * pRel[i] * x * mult[i]);
    const total = sum(raw);
    const p = matchup(bRel, pRel, LG, Float64Array.from(mult));
    near(sum(p), 1, 1e-12, '합');
    raw.forEach((x, i) => near(p[i], x / total, 1e-12, `사건 ${i}`));
  });

  it('배수가 모두 1이면 배수가 없는 것과 같다', () => {
    const bRel = [0.9, 1, 1.6, 1, 1.2, 1, 0.95];
    const plain = matchup(bRel, ONES, LG);
    const withOnes = matchup(bRel, ONES, LG, ONES);
    plain.forEach((x, i) => near(withOnes[i], x, 1e-15, `사건 ${i}`));
  });

  it('삼진형 투수는 같은 타자의 삼진 비율을 올린다', () => {
    expect(matchup(ONES, [1.5, 1, 1, 1, 1, 1, 1], LG)[EV.K]).toBeGreaterThan(matchup(ONES, ONES, LG)[EV.K]);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const bRel = [0.8, 1.2, 2, 1, 1.2, 1, 0.9];
    const copy = [...bRel];
    matchup(bRel, ONES, LG, [2, 1, 1, 1, 1, 1, 1]);
    expect(bRel).toEqual(copy);
  });
});

describe('batterWin', () => {
  it('타자 출루 확률은 1 − K − OUT', () => {
    const d = [0.2, 0.1, 0.03, 0.01, 0.05, 0.15, 0.46];
    near(batterWin(d), 1 - 0.2 - 0.46, 1e-15);
  });

  it('리그 평균 매치업에서 볼넷·안타 비율의 합과 같다', () => {
    const p = matchup(ONES, ONES, LG);
    near(batterWin(p), p[EV.BB] + p[EV.HR] + p[EV.T3] + p[EV.D2] + p[EV.S1], 1e-12);
  });
});
