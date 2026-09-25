import { describe, expect, it } from 'vitest';
import { basesOf, eventOf, pitchRow, validHomeWp, walkPitches } from './relay';

/*
 * pipeline/tmi_pipeline/relay.py의 동작을 그대로 고정한다. 여기 값이 바뀌면 TS 파서와 파이프라인이
 * 서로 다른 경기를 읽게 되므로, 고칠 일이 생기면 양쪽을 같이 고친다(step2.md 금지사항).
 */

describe('eventOf', () => {
  it.each([
    ['김타자 : 삼진', 0],
    ['김타자 : 삼진 아웃', 0],
    ['김타자 : 볼넷', 1],
    ['김타자 : 고의4구', 1],
    ['김타자 : 몸에 맞는 공', 1],
    ['김타자 : 좌월 3점 홈런', 2],
    ['김타자 : 우중간 3루타', 3],
    ['김타자 : 좌중간 2루타', 4],
    ['김타자 : 중전 1루타', 5],
    ['김타자 : 내야 안타', 5],
    ['김타자 : 유격수 앞 땅볼', 6],
    ['김타자 : 좌익수 뜬공', 6],
    ['김타자 : 유격수 앞 병살타', 6],
  ])('%s → %i', (text, event) => {
    expect(eventOf(text)).toBe(event);
  });

  it('낫 아웃은 붙여 쓰든 띄어 쓰든 삼진이다', () => {
    expect(eventOf('김타자 : 스트라이크 낫 아웃 출루')).toBe(0);
    expect(eventOf('김타자 : 낫아웃 폭투')).toBe(0);
  });

  it('낫 아웃으로 출루해도 안타가 아니라 삼진이다', () => {
    // relay.py의 한계 주석: 사건 벡터에 "삼진 뒤 출루"가 없다
    expect(eventOf('김타자 : 낫 아웃 포일로 1루타성 출루')).toBe(0);
  });

  it('먼저 걸리는 키워드를 쓴다', () => {
    expect(eventOf('삼진 뒤 홈런성 타구')).toBe(0);
  });
});

describe('basesOf', () => {
  it.each([
    [{}, 0],
    [{ base1: '0', base2: '0', base3: '0' }, 0],
    [{ base1: '12345', base2: '0', base3: '0' }, 1],
    [{ base1: '0', base2: '12345', base3: '0' }, 2],
    [{ base1: '0', base2: '0', base3: '12345' }, 4],
    [{ base1: '1', base2: '2', base3: '3' }, 7],
  ])('%o → %i', (state, bases) => {
    expect(basesOf(state)).toBe(bases);
  });

  it('빈 문자열·null은 빈 루다', () => {
    expect(basesOf({ base1: '', base2: null, base3: '9' })).toBe(4);
  });
});

describe('validHomeWp', () => {
  it('홈 승리확률을 0~1로 돌려준다', () => {
    expect(validHomeWp({ homeTeamWinRate: 60, awayTeamWinRate: 40 })).toBe(0.6);
  });

  it('합이 99~101이면 받는다', () => {
    expect(validHomeWp({ homeTeamWinRate: 50.4, awayTeamWinRate: 49.2 })).toBeCloseTo(0.504);
  });

  it('합이 범위 밖이면 null', () => {
    expect(validHomeWp({ homeTeamWinRate: 60, awayTeamWinRate: 30 })).toBeNull();
    expect(validHomeWp({ homeTeamWinRate: 0, awayTeamWinRate: 0 })).toBeNull();
  });

  it('없거나 한쪽이 비면 null', () => {
    expect(validHomeWp(null)).toBeNull();
    expect(validHomeWp(undefined)).toBeNull();
    expect(validHomeWp({ homeTeamWinRate: 60 })).toBeNull();
  });
});

describe('walkPitches', () => {
  const opts = (results: string[]) =>
    results.map((pitchResult, i) => ({ type: 1, seqno: i, pitchResult, ptsPitchId: `p${i}` }));

  it('볼카운트는 던지기 전 값이다', () => {
    const got = [...walkPitches(opts(['B', 'S', 'F', 'F', 'B', 'S']), {})];
    expect(got.map((x) => [x.balls, x.strikes])).toEqual([
      [0, 0], [1, 0], [1, 1], [1, 2], [1, 2], [2, 2],
    ]);
  });

  it('볼은 3, 스트라이크는 2에서 멈춘다', () => {
    const got = [...walkPitches(opts(['B', 'B', 'B', 'B', 'B']), {})];
    expect(got.map((x) => x.balls)).toEqual([0, 1, 2, 3, 3]);
  });

  it('투구가 아니거나 모르는 결과는 건너뛴다', () => {
    const mixed = [
      { type: 8, seqno: 0, pitchResult: 'S' },
      { type: 1, seqno: 1, pitchResult: 'S' },
      { type: 1, seqno: 2, pitchResult: '?' },
      { type: 1, seqno: 3, pitchResult: 'B' },
    ];
    expect([...walkPitches(mixed, {})].map((x) => [x.balls, x.strikes])).toEqual([[0, 0], [0, 1]]);
  });

  it('PTS를 ptsPitchId로 이어 붙이고 없으면 null이다', () => {
    const got = [...walkPitches(opts(['S', 'B']), { p0: { pitchId: 'p0', stance: 'L' } })];
    expect(got[0].pts).toEqual({ pitchId: 'p0', stance: 'L' });
    expect(got[1].pts).toBeNull();
  });
});

describe('pitchRow', () => {
  const pts = {
    stance: 'R', x0: 1.23456, z0: 5.98765, vx0: 5.2, vy0: -130.0, vz0: -4.1,
    ax: -10.8, ay: 28.4, az: -14.5, topSz: 3.29, bottomSz: 1.596,
  };

  it('16칸이고 구종·구속·결과·볼카운트·스탠스 순이다', () => {
    const row = pitchRow({ stuff: '슬라이더', speed: 138.7, pitchResult: 'S' }, pts, 1, 2);
    expect(row).toHaveLength(16);
    expect(row.slice(0, 6)).toEqual([3, 138, 2, 1, 2, 1]);
  });

  it('모르는 구종은 기타(마지막 인덱스)다', () => {
    expect(pitchRow({ stuff: '너클볼', speed: 120, pitchResult: 'B' }, pts, 0, 0)[0]).toBe(8);
    expect(pitchRow({ speed: 120, pitchResult: 'B' }, pts, 0, 0)[0]).toBe(8);
  });

  it('좌타 스탠스는 0이다', () => {
    expect(pitchRow({ stuff: '직구', speed: 145, pitchResult: 'S' }, { ...pts, stance: 'L' }, 0, 0)[5]).toBe(0);
  });

  it('PTS 10개를 소수 3자리로 반올림한다', () => {
    const row = pitchRow({ stuff: '직구', speed: 145, pitchResult: 'S' }, pts, 0, 0);
    expect(row.slice(6)).toEqual([1.235, 5.988, 5.2, -130, -4.1, -10.8, 28.4, -14.5, 3.29, 1.596]);
  });

  it('구속은 정수로 자른다', () => {
    expect(pitchRow({ stuff: '직구', speed: 145.9, pitchResult: 'S' }, pts, 0, 0)[1]).toBe(145);
  });
});

describe('PTS 반올림은 Python round()와 같다', () => {
  // 실제 140경기 대조(npm run check:relay)에서 이 규칙이 틀리면 투구 42,848개 중 수백 개가 어긋난다
  const pts = (ax: number) => ({
    stance: 'R', x0: 0, z0: 0, vx0: 0, vy0: 0, vz0: 0, ax, ay: 0, az: 0, topSz: 0, bottomSz: 0,
  });
  const axOf = (v: number) => pitchRow({ stuff: '직구', speed: 145, pitchResult: 'S' }, pts(v), 0, 0)[11];

  it('곱셈 오차로 올려 보내지 않는다', () => {
    // 28.3065의 실제 이진값은 28.30649999...라 내려야 한다. Math.round(x*1000)은 28.307을 준다
    expect(axOf(28.3065)).toBe(28.306);
    expect(axOf(3.1355)).toBe(3.135);
  });

  it('정확히 절반이면 짝수 쪽으로 보낸다', () => {
    // 이진 분수만 정확히 절반이 된다. toFixed(3)은 0에서 먼 쪽(-12.063)으로 보내지만 Python은 짝수로 보낸다
    expect(axOf(-12.0625)).toBe(-12.062); // 062는 짝수 → 그대로
    expect(axOf(12.0625)).toBe(12.062);
    expect(axOf(0.1875)).toBe(0.188); // 187은 홀수 → 올린다
    expect(axOf(0.3125)).toBe(0.312); // 312는 짝수 → 그대로
  });

  it('십진수로 절반처럼 보여도 이진값이 아래면 내린다', () => {
    // 12.0635의 이진값은 12.06349...라 절반이 아니다. Python도 12.063이다
    expect(axOf(12.0635)).toBe(12.063);
  });

  it('절반이 아니면 평범하게 반올림한다', () => {
    expect(axOf(1.23456)).toBe(1.235);
    expect(axOf(-1.23456)).toBe(-1.235);
    expect(axOf(1.2344)).toBe(1.234);
  });
});
