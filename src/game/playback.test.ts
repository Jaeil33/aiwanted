import { beforeAll, describe, expect, it } from 'vitest';
import {
  EV,
  applyTransition,
  createGame,
  createRng,
  sampleInPlay,
  sampleTransition,
  startNextHalf,
  transitions,
  type Evaluation,
} from '../engine';
import { AP_ROWS, fixtureAppData, fixtureSetup, fixtureSituation } from '../test/fixtures/appData';
import type { PitchRow, Situation } from '../types/data';
import type { EventIndex, GameState, PitchCode, Transition } from '../types/domain';
import {
  countBucket,
  headline,
  logEntryFor,
  pickPitchRow,
  MIN_GAME_ROWS,
  pitchRowsFor,
  playbackFor,
  resolvePitch,
  samplePitchCode,
  stageSceneFor,
} from './playback';
import { buildSituationSetup } from './situation';

const setup = fixtureSetup();
/** 9회말 2사 만루 4:4, h6(좌타) vs ap(우투) */
const START = setup.situation.state;
/** 9회말이 끝난 뒤 10회초: a4(우타) vs 홈 불펜 */
const TENTH_TOP = startNextHalf({ ...START, outs: 3, bases: 0 });

let ev: Evaluation;

beforeAll(() => {
  const game = createGame({ lg: setup.lg, away: setup.away, home: setup.home, effects: [], mode: 'real', countTable: setup.countTable });
  ev = game.evaluate(START, setup.scenePitcher, { first: true });
}, 120_000);

/** 정해 둔 값을 차례로 내는 난수. 다 쓴 뒤 더 부르면 Error */
function scripted(values: readonly number[]) {
  let used = 0;
  const r = () => {
    if (used >= values.length) throw new Error(`난수를 ${values.length}개보다 많이 썼다`);
    return values[used++];
  };
  return Object.assign(r, { used: () => used });
}

const NO_RANDOM = (): number => {
  throw new Error('난수를 쓰면 안 된다');
};

/** 상태·사건에서 조건에 맞는 첫 주루 분기와 그 결과 */
function branch(state: GameState, event: EventIndex, pick: (t: Transition) => boolean = () => true) {
  const transition = transitions(state.bases, state.outs, event).find(pick);
  if (!transition) throw new Error('조건에 맞는 주루 분기가 없다');
  const applied = applyTransition(state, transition);
  return { ended: { event, transition }, over: applied.over, after: applied.state };
}

describe('samplePitchCode', () => {
  it('그 카운트의 [B, T, S, F, X] 누적 구간으로 고르고 난수를 하나 쓴다', () => {
    const q = ev.count?.rates[1 * 3 + 2] ?? [];
    expect(q).toHaveLength(5);
    expect(samplePitchCode(ev, 1, 2, () => 0)).toBe('B');
    expect(samplePitchCode(ev, 1, 2, () => q[0])).toBe('T');
    expect(samplePitchCode(ev, 1, 2, () => q[0] + q[1])).toBe('S');
    expect(samplePitchCode(ev, 1, 2, () => q[0] + q[1] + q[2])).toBe('F');
    expect(samplePitchCode(ev, 1, 2, () => q[0] + q[1] + q[2] + q[3])).toBe('X');
    expect(samplePitchCode(ev, 1, 2, () => 0.999999999)).toBe('X');
    const r = scripted([0.5]);
    samplePitchCode(ev, 0, 0, r);
    expect(r.used()).toBe(1);
  });

  it('고정 seed 20만 번 빈도가 카운트별 확률과 3σ 안에서 맞는다', { timeout: 60_000 }, () => {
    const N = 200_000;
    for (const [balls, strikes] of [[0, 0], [3, 2]] as const) {
      const r = createRng(20260914 + balls * 3 + strikes);
      const tally: Record<PitchCode, number> = { B: 0, T: 0, S: 0, F: 0, X: 0 };
      for (let n = 0; n < N; n++) tally[samplePitchCode(ev, balls, strikes, r)] += 1;
      const rates = ev.count?.rates[balls * 3 + strikes] ?? [];
      (['B', 'T', 'S', 'F', 'X'] as const).forEach((code, k) => {
        const p = rates[k];
        const sigma = Math.sqrt((p * (1 - p)) / N);
        expect(Math.abs(tally[code] / N - p), `${balls}-${strikes} ${code}`).toBeLessThanOrEqual(3 * sigma);
      });
    }
  });

  it('카운트 모델이 없으면 Error, 카운트가 범위 밖이면 RangeError', () => {
    expect(() => samplePitchCode({ ...ev, count: null }, 0, 0, () => 0.5)).toThrow(Error);
    expect(() => samplePitchCode(ev, 4, 0, () => 0.5)).toThrow(RangeError);
    expect(() => samplePitchCode(ev, 0, 3, () => 0.5)).toThrow(RangeError);
  });
});

describe('resolvePitch', () => {
  it('타석이 이어지면 다음 카운트만 돌려주고 난수를 쓰지 않는다', () => {
    expect(resolvePitch(ev, START, 0, 0, 'B', NO_RANDOM)).toEqual({ balls: 1, strikes: 0, ended: null });
    expect(resolvePitch(ev, START, 1, 1, 'T', NO_RANDOM)).toEqual({ balls: 1, strikes: 2, ended: null });
    expect(resolvePitch(ev, START, 2, 2, 'F', NO_RANDOM)).toEqual({ balls: 2, strikes: 2, ended: null });
  });

  it('2스트라이크의 T·S는 삼진: 스트라이크 3과 표의 K 분기', () => {
    for (const code of ['T', 'S'] as const) {
      const res = resolvePitch(ev, START, 1, 2, code, NO_RANDOM);
      expect(res).toMatchObject({ balls: 1, strikes: 3 });
      expect(res.ended?.event).toBe(EV.K);
      expect(res.ended?.transition).toBe(transitions(START.bases, START.outs, EV.K)[0]);
    }
  });

  it('3볼의 B는 볼넷: 볼 4와 표의 BB 분기 (만루면 밀어내기 1점)', () => {
    const res = resolvePitch(ev, START, 3, 1, 'B', NO_RANDOM);
    expect(res).toMatchObject({ balls: 4, strikes: 1 });
    expect(res.ended?.event).toBe(EV.BB);
    expect(res.ended?.transition).toBe(transitions(START.bases, START.outs, EV.BB)[0]);
    expect(res.ended?.transition.runs).toBe(1);
  });

  it('인플레이(X)는 sampleInPlay로 사건, sampleTransition으로 주루 분기를 차례로 뽑는다', () => {
    for (const values of [[0.001, 0.5], [0.999, 0.2], [0.6, 0.9]]) {
      const r = scripted(values);
      const event = sampleInPlay(ev.pa, scripted([values[0]]));
      const transition = sampleTransition(START.bases, START.outs, event, scripted([values[1]]));
      expect(resolvePitch(ev, START, 1, 1, 'X', r)).toEqual({ balls: 1, strikes: 1, ended: { event, transition } });
      expect(r.used()).toBe(2);
    }
    const slam = resolvePitch(ev, START, 0, 0, 'X', scripted([0.001, 0.5]));
    expect(slam.ended?.event).toBe(EV.HR);
    expect(slam.ended?.transition.runs).toBe(4);
  });
});

describe('countBucket', () => {
  it('볼·스트라이크 우열(같음 0·볼 우세 1·스트라이크 우세 2) + 2스트라이크면 10', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 1, 0],
      [1, 0, 1],
      [3, 1, 1],
      [0, 1, 2],
      [2, 2, 10],
      [3, 2, 11],
      [1, 2, 12],
      [0, 2, 12],
    ];
    for (const [balls, strikes, bucket] of cases) expect(countBucket(balls, strikes), `${balls}-${strikes}`).toBe(bucket);
  });
});

describe('pickPitchRow', () => {
  // [type, speed, code, balls, strikes, stance(0 좌타·1 우타), ...]
  const row = (code: number, balls: number, strikes: number, stance: number, speed = 140): PitchRow => [
    0, speed, code, balls, strikes, stance, 0, 0, 0, -130, 0, 0, 25, -30, 3.4, 1.6,
  ];

  it('같은 결과·손·카운트 유형 → 결과·손 → 결과 → 아무거나 (app.js pickPitch)', () => {
    const rows: PitchRow[] = [row(0, 0, 0, 1, 150), row(1, 0, 2, 1, 135), row(1, 3, 0, 0, 136), row(4, 1, 1, 1, 131)];
    expect(pickPitchRow(rows, 'T', 0, 2, 'R', () => 0)).toBe(rows[1]);
    expect(pickPitchRow(rows, 'T', 3, 0, 'L', () => 0)).toBe(rows[2]);
    expect(pickPitchRow(rows, 'T', 1, 0, 'R', () => 0)).toBe(rows[1]);
    expect(pickPitchRow(rows, 'X', 2, 2, 'L', () => 0)).toBe(rows[3]);
    expect(pickPitchRow(rows, 'S', 0, 0, 'R', () => 0.99)).toBe(rows[3]);
    expect(pickPitchRow(rows, 'S', 0, 0, 'R', () => 0)).toBe(rows[0]);
  });

  it('후보 안에서 난수 하나로 고르고, 행이 없으면 난수를 쓰지 않고 null', () => {
    const pool: PitchRow[] = [row(0, 0, 0, 1, 141), row(0, 1, 1, 1, 142), row(0, 2, 2, 1, 143)];
    expect(pickPitchRow(pool, 'B', 1, 1, 'R', () => 0)).toBe(pool[0]);
    expect(pickPitchRow(pool, 'B', 1, 1, 'R', () => 0.6)).toBe(pool[1]);
    expect(pickPitchRow(pool, 'B', 1, 1, 'R', () => 0.9999)).toBe(pool[1]);
    expect(pickPitchRow(pool, 'B', 2, 2, 'R', () => 0.5)).toBe(pool[2]);
    const r = scripted([0.3]);
    pickPitchRow(pool, 'B', 0, 0, 'R', r);
    expect(r.used()).toBe(1);
    expect(pickPitchRow([], 'B', 0, 0, 'R', NO_RANDOM)).toBeNull();
  });

  it('픽스처 장면 투수 표본에서 좌타자에게 던진 인플레이 공을 고른다', () => {
    expect(pickPitchRow(AP_ROWS, 'X', 0, 0, 'L', () => 0)).toBe(AP_ROWS[8]);
  });
});

describe('pitchRowsFor', () => {
  const { pitches } = fixtureAppData;

  it('그 경기 표본이 없으면 투수 손 기준 리그 표본이다', () => {
    // 번들에는 투수별 표본이 없다(ADR-035). 그 경기 투구는 /api/game이 돌려준다
    expect(pitchRowsFor(fixtureAppData, setup, 'ap', 'R')).toBe(pitches.pools.R);
    expect(pitchRowsFor(fixtureAppData, setup, 'LT-pen', 'L')).toBe(pitches.pools.L);
  });

  it('그 경기에서 던진 공이 넉넉하면 그것만 쓴다', () => {
    const own = Array.from({ length: MIN_GAME_ROWS }, () => AP_ROWS[0]);
    const withGame = { ...setup, gameRows: { ap: own } };
    expect(pitchRowsFor(fixtureAppData, withGame, 'ap', 'R')).toBe(own);
  });

  it('모자라면 리그 표본을 뒤에 붙인다', () => {
    const own = [AP_ROWS[0]];
    const withGame = { ...setup, gameRows: { 'LT-pen': own } };
    const rows = pitchRowsFor(fixtureAppData, withGame, 'LT-pen', 'R');
    expect(rows.length).toBe(1 + pitches.pools.R.length);
    expect(rows[0]).toBe(own[0]);
  });
});

describe('headline', () => {
  const NINTH_BOTTOM: GameState = { inning: 9, half: 1, outs: 2, bases: 0b111, away: 5, home: 4, slotAway: 3, slotHome: 5 };
  const MIDGAME: GameState = { inning: 5, half: 0, outs: 0, bases: 0, away: 1, home: 1, slotAway: 2, slotHome: 4 };
  const line = (state: GameState, event: EventIndex, pick?: (t: Transition) => boolean) => {
    const { ended, over } = branch(state, event, pick);
    return headline(ended.event, ended.transition, over);
  };

  it('app.js 예시: 끝내기 만루 홈런, 밀어내기 볼넷, 병살타, 2타점 적시타', () => {
    expect(line(NINTH_BOTTOM, EV.HR)).toBe('끝내기 만루 홈런!');
    expect(line({ ...NINTH_BOTTOM, away: 6 }, EV.BB)).toBe('밀어내기 볼넷');
    expect(line({ ...MIDGAME, outs: 1, bases: 0b001 }, EV.OUT, (t) => t.play === 'DP')).toBe('병살타');
    expect(line({ ...MIDGAME, outs: 1, bases: 0b110 }, EV.S1, (t) => t.runs === 2)).toBe('2타점 적시타');
  });

  it('끝내기·홈런 크기·안타 종류', () => {
    const tied: GameState = { ...NINTH_BOTTOM, away: 4, home: 4 };
    expect(line(tied, EV.BB)).toBe('끝내기 밀어내기 볼넷!');
    expect(line({ ...tied, bases: 0b100 }, EV.S1)).toBe('끝내기 안타!');
    expect(line({ ...tied, outs: 1, bases: 0b100 }, EV.OUT, (t) => t.play === 'SF')).toBe('끝내기 희생플라이!');
    expect(line(MIDGAME, EV.HR)).toBe('솔로 홈런!');
    expect(line({ ...MIDGAME, outs: 1, bases: 0b010 }, EV.HR)).toBe('2점 홈런!');
    expect(line(MIDGAME, EV.S1)).toBe('안타');
    expect(line(MIDGAME, EV.D2)).toBe('2루타');
    expect(line(MIDGAME, EV.T3)).toBe('3루타');
    expect(line({ ...MIDGAME, bases: 0b010 }, EV.D2)).toBe('1타점 2루타');
  });

  it('삼진·볼넷·범타 종류', () => {
    expect(line(MIDGAME, EV.K)).toBe('삼진');
    expect(line(MIDGAME, EV.BB)).toBe('볼넷');
    expect(line(MIDGAME, EV.OUT, (t) => t.play === 'GB')).toBe('땅볼 아웃');
    expect(line({ ...MIDGAME, bases: 0b100 }, EV.OUT, (t) => t.play === 'GB' && t.runs === 1)).toBe('땅볼 타점');
    expect(line(MIDGAME, EV.OUT, (t) => t.play === 'FB')).toBe('뜬공 아웃');
    expect(line({ ...MIDGAME, bases: 0b100 }, EV.OUT, (t) => t.play === 'SF')).toBe('희생플라이');
    expect(line(MIDGAME, EV.OUT, (t) => t.play === 'LD')).toBe('직선타 아웃');
  });
});

describe('stageSceneFor', () => {
  it('공격 팀 색·홈 여부·타자 타석 방향과 수비 팀 색·홈 여부·투수 손', () => {
    expect(stageSceneFor(setup, START)).toEqual({
      bat: { color: '#5C8DF6', home: true, bats: 'L' },
      fld: { color: '#F0474B', home: false, throws: 'R' },
    });
    expect(stageSceneFor(setup, TENTH_TOP)).toEqual({
      bat: { color: '#F0474B', home: false, bats: 'R' },
      fld: { color: '#5C8DF6', home: true, throws: 'R' },
    });
  });

  it('좌투 장면 투수면 throws L이고 스위치 타자는 우타석', () => {
    const lefty: Situation = {
      ...fixtureSituation,
      id: 'fixture-lefty',
      batter: 'a5',
      pitcher: 'hp',
      state: { ...START, half: 0, slotAway: 4 },
    };
    const s = buildSituationSetup(fixtureAppData.core, lefty);
    expect(stageSceneFor(s, lefty.state)).toEqual({
      bat: { color: '#F0474B', home: false, bats: 'R' },
      fld: { color: '#5C8DF6', home: true, throws: 'L' },
    });
  });
});

describe('playbackFor', () => {
  type Args = Parameters<typeof playbackFor>[0];
  const args = (over: Partial<Args>): Args => ({
    setup,
    data: fixtureAppData,
    state: START,
    code: 'B',
    balls: 0,
    strikes: 0,
    number: 1,
    ended: null,
    over: null,
    fast: false,
    r: () => 0,
    ...over,
  });

  it('타석이 이어지는 공: 투구 행·결과·번호·속도·타석 방향만 담고 결과 연출은 없다', () => {
    const r = scripted([0]);
    const pb = playbackFor(args({ code: 'B', balls: 1, strikes: 1, number: 3, fast: true, r }));
    // 번들에 투수별 표본이 없으므로 우투 리그 풀에서 고른다(ADR-035)
    const pool = fixtureAppData.pitches.pools.R;
    expect(pb).toEqual({ row: pickPitchRow(pool, 'B', 1, 1, 'L', () => 0), code: 'B', number: 3, fast: true, bats: 'L', play: null });
    expect(pb.row).not.toBeNull();
    expect(r.used()).toBe(1);
  });

  it('끝내기 만루 홈런: 타구 play·주자 이동·타석 뒤 주자·큰 배너', () => {
    const { ended, over, after } = branch(START, EV.HR);
    const pb = playbackFor(args({ code: 'X', balls: 1, strikes: 1, number: 3, ended, over }));
    expect(pb).toMatchObject({
      code: 'X',
      number: 3,
      bats: 'L',
      play: 'HR',
      moves: ended.transition.moves,
      basesAfter: after.bases,
      banner: { text: '끝내기 만루 홈런!', tone: 'big' },
    });
    expect(pb.row).toBe(pickPitchRow(fixtureAppData.pitches.pools.R, 'X', 1, 1, 'L', () => 0));
  });

  it('삼진·볼넷은 play가 null이고, 톤은 끝내기일 때 big', () => {
    const k = branch(START, EV.K);
    expect(k.over).toEqual({ kind: 'half' });
    expect(playbackFor(args({ code: 'S', balls: 0, strikes: 2, ended: k.ended, over: k.over }))).toMatchObject({
      play: null,
      moves: k.ended.transition.moves,
      basesAfter: 0,
      banner: { text: '삼진', tone: 'normal' },
    });

    const walk = branch(START, EV.BB);
    expect(playbackFor(args({ code: 'B', balls: 3, strikes: 0, ended: walk.ended, over: walk.over }))).toMatchObject({
      play: null,
      basesAfter: 7,
      banner: { text: '끝내기 밀어내기 볼넷!', tone: 'big' },
    });
  });

  it('2점 이상이면 big, 1점 적시타는 normal, 장면 밖 반이닝은 불펜의 손 기준 리그 표본', () => {
    const state: GameState = { inning: 5, half: 0, outs: 0, bases: 0b110, away: 1, home: 1, slotAway: 4, slotHome: 0 };
    const double = branch(state, EV.D2);
    const doublePb = playbackFor(args({ state, code: 'X', ended: double.ended, over: double.over, r: () => 0.5 }));
    expect(doublePb).toMatchObject({ play: '2B', bats: 'L', banner: { text: '2타점 2루타', tone: 'big' } });
    expect(fixtureAppData.pitches.pools.R).toContain(doublePb.row);

    const singleState: GameState = { ...state, bases: 0b100 };
    const single = branch(singleState, EV.S1);
    expect(playbackFor(args({ state: singleState, code: 'X', ended: single.ended, over: single.over })).banner).toEqual({
      text: '1타점 적시타',
      tone: 'normal',
    });
  });

  it('bats는 stageSceneFor의 타자 타석 방향과 같다 (스위치 타자 포함)', () => {
    for (const state of [START, TENTH_TOP, { ...TENTH_TOP, slotAway: 4 }, { ...START, slotHome: 6 }]) {
      expect(playbackFor(args({ state })).bats).toBe(stageSceneFor(setup, state).bat.bats);
    }
  });
});

describe('logEntryFor', () => {
  it('타석 전 이닝·초말, 타자·투수 이름, 타석 뒤 점수를 담는다', () => {
    const { after } = branch(START, EV.HR);
    expect(
      logEntryFor({
        setup,
        index: 0,
        before: START,
        after,
        batterId: 'h6',
        pitcherId: 'ap',
        headline: '끝내기 만루 홈런!',
        wpHomeAfter: 1,
        highlight: true,
      }),
    ).toEqual({
      index: 0,
      inning: 9,
      half: 1,
      batterName: '홈타자6',
      pitcherName: '원정투수',
      headline: '끝내기 만루 홈런!',
      score: { away: 4, home: 8 },
      wpHomeAfter: 1,
      highlight: true,
    });
  });

  it('불펜 투수는 "<팀 이름> 불펜", 모르는 id는 id 그대로', () => {
    const base = {
      setup,
      index: 4,
      before: TENTH_TOP,
      after: TENTH_TOP,
      batterId: 'a4',
      pitcherId: 'LT-pen',
      headline: '삼진',
      wpHomeAfter: null,
      highlight: false,
    };
    expect(logEntryFor(base)).toMatchObject({ index: 4, inning: 10, half: 0, batterName: '원정타자4', pitcherName: '롯데 불펜', wpHomeAfter: null });
    expect(logEntryFor({ ...base, batterId: 'x9' }).batterName).toBe('x9');
  });
});
