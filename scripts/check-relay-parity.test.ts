import { describe, expect, it } from 'vitest';
import { compare } from './check-relay-parity';

/*
 * 대조 로직 자체를 합성 데이터로 고정한다. 실제 140경기 대조는 `npm run check:relay`가 한다.
 * 가상 선수 id만 쓴다(공개 저장소).
 */

/** 타자 소개 + 투구 하나로 된 최소 relay */
function relay(over: { no: number; inn: number; homeOrAway: string; batter: string; pitcher: string; result?: string }) {
  const gs = {
    pitcher: over.pitcher, batter: over.batter, out: '0', ball: '0', strike: '0',
    base1: '0', base2: '0', base3: '0', awayScore: '0', homeScore: '0',
  };
  return {
    no: over.no,
    inn: over.inn,
    homeOrAway: over.homeOrAway,
    metricOption: { homeTeamWinRate: 50, awayTeamWinRate: 50 },
    ptsOptions: [{
      pitchId: `${over.no}-1`, stance: 'R',
      x0: 1, z0: 5, vx0: 5, vy0: -130, vz0: -4, ax: -10, ay: 28, az: -14, topSz: 3.3, bottomSz: 1.6,
    }],
    textOptions: [
      { type: 8, seqno: over.no * 10, batterRecord: { pcode: over.batter, name: '김타자', batOrder: 1, hitType: '우투우타' }, currentGameState: gs },
      { type: 1, seqno: over.no * 10 + 1, pitchResult: 'S', stuff: '직구', speed: 145, ptsPitchId: `${over.no}-1`, currentGameState: gs },
      { type: 13, seqno: over.no * 10 + 2, text: over.result ?? '김타자 : 삼진', currentGameState: gs },
    ],
  };
}

const RAW = { textRelays: [relay({ no: 1, inn: 1, homeOrAway: '0', batter: 'b1', pitcher: 'p1' })] };

/** 그 원자료를 TS 파서가 내는 값과 같게 적은 기준값 */
const GOOD = [{
  index: 0, inning: 1, half: 0, batter: 'b1', pitcher: 'p1', batOrder: 1,
  outs: 0, bases: 0, away: 0, home: 0, event: 0, runs: 0, complete: true,
  rows: [[0, 145, 2, 0, 0, 1, 1, 5, 5, -130, -4, -10, 28, -14, 3.3, 1.6]],
}];

describe('compare', () => {
  it('같으면 어긋남이 없다', () => {
    const r = compare({ G1: GOOD }, () => RAW);
    expect(r.mismatches).toEqual([]);
    expect(r.games).toBe(1);
    expect(r.matched).toBe(1);
    expect(r.plateAppearances).toBe(1);
    expect(r.pitchesMatched).toBe(1);
    expect(r.pitches).toBe(1);
  });

  it('타석 값이 다르면 잡아낸다', () => {
    const wrong = [{ ...GOOD[0], event: 5 }];
    const r = compare({ G1: wrong }, () => RAW);
    expect(r.matched).toBe(0);
    expect(r.mismatches.map((m) => m.what)).toContain('타석 값');
  });

  it('타석 수가 다르면 잡아낸다', () => {
    const r = compare({ G1: [...GOOD, { ...GOOD[0], index: 1 }] }, () => RAW);
    expect(r.mismatches.map((m) => m.what)).toContain('타석 수');
  });

  it('투구 행이 다르면 잡아낸다', () => {
    const wrong = [{ ...GOOD[0], rows: [[0, 999, 2, 0, 0, 1, 1, 5, 5, -130, -4, -10, 28, -14, 3.3, 1.6]] }];
    const r = compare({ G1: wrong }, () => RAW);
    expect(r.pitchesMatched).toBe(0);
    expect(r.mismatches.some((m) => m.what.startsWith('투구'))).toBe(true);
  });

  it('원자료가 없는 경기는 건너뛴다', () => {
    const r = compare({ G1: GOOD }, () => null);
    expect(r.games).toBe(0);
    expect(r.mismatches).toEqual([]);
  });

  it('어긋남 목록이 끝없이 커지지 않는다', () => {
    const many = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`G${i}`, [{ ...GOOD[0], event: 5 }]]),
    );
    const r = compare(many, () => RAW);
    expect(r.mismatches.length).toBeLessThanOrEqual(20);
    expect(r.matched).toBe(0);
  });
});
