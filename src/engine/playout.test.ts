import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { fixtureAppData, fixtureSituation } from '../test/fixtures/appData';
import type { GameState, KnobPart, SceneContext } from '../types/domain';
import { compileKnobPart } from './effects';
import { applyTransition, createGame, startNextHalf, type Game, type GameConfig, type LineupSlot, type TeamConfig } from './game';
import { expectedCounts, pickHighlights, playout, type PlayoutInput, type PlayoutPA, type PlayoutResult } from './playout';
import { createRng } from './rng';
import { transitions } from './transitions';

const { core } = fixtureAppData;
const SCENE = fixtureSituation;
const LG = core.league;
const TABLE = core.countTable;
/** createGame·재생 수천 번은 수 초가 걸릴 수 있다 */
const SLOW = { timeout: 120_000 };

const player = (id: string): LineupSlot => ({ id, rel: core.players[id].rel });
const bullpen = (code: string): LineupSlot => ({ id: core.bullpens[code].id, rel: core.bullpens[code].rel });
const AWAY: TeamConfig = { lineup: SCENE.lineups.away.map(player), bullpen: bullpen('HT') };
const HOME: TeamConfig = { lineup: SCENE.lineups.home.map(player), bullpen: bullpen('LT') };
/** 장면 투수 ap: 원정, 9회말을 던진다 */
const AP = player(SCENE.pitcher);
/** 홈 투수 hp: 초 공격 장면에 쓴다 */
const HP = player('hp');
const SCENE_CTX: SceneContext = { batterId: SCENE.batter, pitcherId: SCENE.pitcher, batSide: 'home' };

const at = (over: Partial<GameState>): GameState => ({
  inning: 1,
  half: 0,
  outs: 0,
  bases: 0,
  away: 0,
  home: 0,
  slotAway: 0,
  slotHome: 0,
  ...over,
});
const SEVENTH = at({ inning: 7, half: 0, outs: 1, bases: 0b001, away: 2, home: 3, slotAway: 3, slotHome: 6 });

const gameConfig = (over: Partial<GameConfig> = {}): GameConfig => ({
  lg: LG,
  away: AWAY,
  home: HOME,
  effects: [],
  mode: 'real',
  countTable: TABLE,
  ...over,
});

let cachedGame: Game | null = null;
/** 효과 없는 픽스처 경기 (한 번만 만든다) */
const fixtureGame = () => (cachedGame ??= createGame(gameConfig()));

function input(over: Partial<PlayoutInput> = {}): PlayoutInput {
  return {
    game: over.game ?? fixtureGame(),
    start: SCENE.state,
    scenePitcher: AP,
    away: AWAY,
    home: HOME,
    lg: LG,
    effects: [],
    mode: 'real',
    countTable: TABLE,
    rng: createRng(1),
    ...over,
  };
}

describe('playout — 실제 투수 차례(relief)', () => {
  /** 9회말 장면. 10회초부터 홈 수비는 hp가 던진다(팀 불펜이 아니라) */
  const RELIEF = {
    plan: [{ inning: 10, half: 0 as const, outs: 0, pitcher: 'hp' }],
    slots: { hp: HP },
  };

  it('시작 반이닝은 그대로 장면 투수다', () => {
    const result = playout(input({ relief: RELIEF, rng: createRng(7) }));
    const first = result.plateAppearances[0];
    expect(first.before.inning).toBe(SCENE.state.inning);
    expect(first.pitcherId).toBe(AP.id);
  });

  it('그 뒤 반이닝은 팀 불펜이 아니라 차례의 투수가 던진다', () => {
    // 경기가 10회초까지 가는 시드를 찾는다
    for (let seed = 1; seed < 200; seed++) {
      const result = playout(input({ relief: RELIEF, rng: createRng(seed) }));
      const tenth = result.plateAppearances.find((pa) => pa.before.inning === 10 && pa.before.half === 0);
      if (!tenth) continue;
      expect(tenth.pitcherId).toBe('hp');
      expect(tenth.pitcherId).not.toBe(HOME.bullpen.id);
      return;
    }
    throw new Error('10회초까지 가는 시드를 찾지 못했다');
  });

  it('차례를 주지 않으면 팀 불펜이 던진다', () => {
    for (let seed = 1; seed < 200; seed++) {
      const result = playout(input({ rng: createRng(seed) }));
      const tenth = result.plateAppearances.find((pa) => pa.before.inning === 10 && pa.before.half === 0);
      if (!tenth) continue;
      expect(tenth.pitcherId).toBe(HOME.bullpen.id);
      return;
    }
    throw new Error('10회초까지 가는 시드를 찾지 못했다');
  });

  it('차례에 없는 반이닝은 팀 불펜으로 떨어진다', () => {
    const onlyBottom = { plan: [{ inning: 10, half: 1 as const, outs: 0, pitcher: 'hp' }], slots: { hp: HP } };
    for (let seed = 1; seed < 200; seed++) {
      const result = playout(input({ relief: onlyBottom, rng: createRng(seed) }));
      const tenth = result.plateAppearances.find((pa) => pa.before.inning === 10 && pa.before.half === 0);
      if (!tenth) continue;
      expect(tenth.pitcherId).toBe(HOME.bullpen.id);
      return;
    }
    throw new Error('10회초까지 가는 시드를 찾지 못했다');
  });
});

function knob(id: KnobPart['knob'], subject: KnobPart['subject'], strength: number, scope: KnobPart['scope'] = 'game'): KnobPart {
  return { kind: 'knob', knob: id, subject, strength, scope, evidence: 'fun', why: '테스트' };
}

function near(actual: number, expected: number, tol: number, label = '') {
  expect(Math.abs(actual - expected), `${label} ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

/** 재생 결과가 타석마다 이어지고 경기 규칙에 맞는지 확인한다 */
function expectConsistent(result: PlayoutResult, inp: PlayoutInput) {
  const pas = result.plateAppearances;
  expect(pas.length).toBeGreaterThan(0);
  let expectedBefore = inp.start;
  pas.forEach((pa, i) => {
    const where = `${i}번째 타석`;
    expect(pa.index, where).toBe(i);
    expect(pa.before, where).toEqual(expectedBefore);
    expect(pa.batSide, where).toBe(pa.before.half === 0 ? 'away' : 'home');
    const batting = pa.batSide === 'away' ? inp.away : inp.home;
    const fielding = pa.batSide === 'away' ? inp.home : inp.away;
    expect(pa.batterId, where).toBe(batting.lineup[pa.batSide === 'away' ? pa.before.slotAway : pa.before.slotHome].id);
    const sceneHalf = pa.before.inning === inp.start.inning && pa.before.half === inp.start.half;
    expect(pa.pitcherId, where).toBe(sceneHalf ? inp.scenePitcher.id : fielding.bullpen.id);
    expect(transitions(pa.before.bases, pa.before.outs, pa.event), where).toContain(pa.transition);
    expect(applyTransition(pa.before, pa.transition), where).toEqual({ state: pa.after, over: pa.over });
    if (inp.countTable) {
      const ends = pa.event === EV.K ? ['T', 'S'] : pa.event === EV.BB ? ['B'] : ['X'];
      expect(ends, where).toContain(pa.pitches.at(-1)?.code);
    } else {
      expect(pa.pitches, where).toEqual([]);
    }
    if (i < pas.length - 1 || result.truncated) expect(pa.over?.kind ?? 'none', where).not.toBe('game');
    expectedBefore = pa.over?.kind === 'half' ? startNextHalf(pa.after) : pa.after;
  });

  const { final, winner, walkoff } = result;
  if (result.truncated) {
    expect(pas).toHaveLength(inp.maxPlateAppearances ?? 300);
    expect(final).toEqual(expectedBefore);
    expect(walkoff).toBe(false);
    expect(winner).toBe(final.home > final.away ? 'home' : final.away > final.home ? 'away' : 'tie');
    return;
  }
  const last = pas[pas.length - 1];
  expect(last.over).toEqual({ kind: 'game', winner, walkoff });
  expect(final).toEqual(last.after);
  expect(final.inning).toBeGreaterThanOrEqual(9);
  expect(final.inning).toBeLessThanOrEqual(11);
  if (winner === 'home') expect(final.home).toBeGreaterThan(final.away);
  if (winner === 'away') expect(final.away).toBeGreaterThan(final.home);
  if (winner === 'tie') {
    expect(final.home).toBe(final.away);
    expect(final).toMatchObject({ inning: 11, half: 1, outs: 3 });
  }
  if (walkoff) {
    expect(winner).toBe('home');
    expect(final.half).toBe(1);
    expect(final.outs).toBeLessThan(3);
  } else {
    expect(final.outs).toBe(3);
  }
}

describe('playout', SLOW, () => {
  it('같은 seed면 결과가 같다(JSON 비교)', () => {
    const run = (seed: number) => JSON.stringify(playout(input({ start: SEVENTH, scenePitcher: HP, rng: createRng(seed) })));
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it('끝난 경기의 winner·walkoff·최종 상태가 점수와 규칙(11회 무승부)에 맞고, 시작 반이닝은 장면 투수·이후는 불펜이 던진다', () => {
    const starts: (readonly [GameState, LineupSlot])[] = [
      [at({}), HP],
      [SEVENTH, HP],
      [SCENE.state, AP],
      [at({ inning: 11, half: 0, away: 3, home: 3, slotAway: 5, slotHome: 1 }), HP],
      [at({ inning: 9, half: 1, outs: 1, bases: 0b010, away: 2, home: 1, slotAway: 0, slotHome: 7 }), AP],
    ];
    const rng = createRng(99);
    const seen = { home: 0, away: 0, tie: 0, walkoff: 0 };
    for (let n = 0; n < 150; n++) {
      const [start, scenePitcher] = starts[n % starts.length];
      const inp = input({ start, scenePitcher, rng, trackWinProbability: false, countTable: n % 2 === 0 ? TABLE : null });
      const result = playout(inp);
      expect(result.truncated).toBe(false);
      expectConsistent(result, inp);
      seen[result.winner] += 1;
      if (result.walkoff) seen.walkoff += 1;
    }
    expect(Object.values(seen).every((x) => x > 0), JSON.stringify(seen)).toBe(true);
  });

  it('승리확률: 모든 값은 0~1, 첫 타석 wpHomeBefore는 evaluate(start, scenePitcher, { detail: false }).winHome, 다음 타석은 직전 wpHomeAfter를 쓴다', () => {
    const game = fixtureGame();
    const inp = input({ start: SEVENTH, scenePitcher: HP, rng: createRng(7) });
    const result = playout(inp);
    expectConsistent(result, inp);
    const pas = result.plateAppearances;
    near(pas[0].wpHomeBefore ?? Number.NaN, game.evaluate(SEVENTH, HP, { detail: false }).winHome, 1e-9, '첫 타석');
    pas.forEach((pa, i) => {
      for (const x of [pa.wpHomeBefore, pa.wpHomeAfter, pa.tieAfter]) {
        expect(x).not.toBeNull();
        expect(x ?? Number.NaN).toBeGreaterThanOrEqual(0);
        expect(x ?? Number.NaN).toBeLessThanOrEqual(1);
      }
      if (i > 0) expect(pa.wpHomeBefore).toBe(pas[i - 1].wpHomeAfter);
    });

    const last = pas[pas.length - 1];
    const ending = result.winner === 'home' ? [1, 0] : result.winner === 'away' ? [0, 0] : [0, 1];
    expect([last.wpHomeAfter, last.tieAfter]).toEqual(ending);

    // 경기가 이어지는 타석의 wpHomeAfter는 다음 상태를 그 반이닝 투수로 first: false 평가한 값이다
    for (const pa of pas.slice(0, 6)) {
      if (pa.over?.kind === 'game') continue;
      const next = pa.over?.kind === 'half' ? startNextHalf(pa.after) : pa.after;
      const sceneHalf = next.inning === SEVENTH.inning && next.half === SEVENTH.half;
      const pitcher = sceneHalf ? HP : (next.half === 0 ? HOME : AWAY).bullpen;
      const ev = game.evaluate(next, pitcher, { first: false, detail: false });
      expect(pa.wpHomeAfter).toBe(ev.winHome);
      expect(pa.tieAfter).toBe(ev.tie);
    }
  });

  it('trackWinProbability: false면 wpHomeBefore·wpHomeAfter·tieAfter가 모두 null', () => {
    const result = playout(input({ start: SEVENTH, scenePitcher: HP, rng: createRng(8), trackWinProbability: false }));
    for (const pa of result.plateAppearances) {
      expect([pa.wpHomeBefore, pa.wpHomeAfter, pa.tieAfter]).toEqual([null, null, null]);
    }
  });

  it('maxPlateAppearances를 넘으면 truncated: true로 멈추고 final은 다음 타석을 칠 상태다', () => {
    const inp = input({ start: at({}), scenePitcher: HP, rng: createRng(3), trackWinProbability: false, maxPlateAppearances: 5 });
    const result = playout(inp);
    expect(result.truncated).toBe(true);
    expect(result.plateAppearances).toHaveLength(5);
    expectConsistent(result, inp);
  });

  it('통계 일치: 장면 상태(9회말 2사 만루 동점)에서 카운트 모델로 3,000번 재생한 홈 승리 비율이 evaluate winHome과 3σ 이내', () => {
    const exact = fixtureGame().evaluate(SCENE.state, AP, { detail: false }).winHome;
    const rng = createRng(2027);
    const n = 3000;
    let homeWins = 0;
    for (let k = 0; k < n; k++) {
      if (playout(input({ rng, trackWinProbability: false })).winner === 'home') homeWins += 1;
    }
    const sigma = Math.sqrt((exact * (1 - exact)) / n);
    expect(Math.abs(homeWins / n - exact), `재생 ${homeWins / n} vs 정확 ${exact} (3σ ${3 * sigma})`).toBeLessThanOrEqual(3 * sigma);
  });

  it("통계 일치: 이번 타석 한정(scope 'pa')·경기 내내 효과와 만화 모드에서도 3,000번 재생한 홈 승리 비율이 evaluate winHome과 3σ 이내", () => {
    const effects = [
      ...compileKnobPart(knob('contact', 'batter', 3, 'pa'), SCENE_CTX, 'tmi-1'),
      ...compileKnobPart(knob('mood', 'fieldingTeam', 2), SCENE_CTX, 'tmi-2'),
    ];
    const game = createGame(gameConfig({ effects, mode: 'toon' }));
    const exact = game.evaluate(SCENE.state, AP, { detail: false }).winHome;
    const rng = createRng(2028);
    const n = 3000;
    let homeWins = 0;
    for (let k = 0; k < n; k++) {
      const result = playout(input({ game, effects, mode: 'toon', rng, trackWinProbability: false }));
      if (result.winner === 'home') homeWins += 1;
    }
    const sigma = Math.sqrt((exact * (1 - exact)) / n);
    expect(Math.abs(homeWins / n - exact), `재생 ${homeWins / n} vs 정확 ${exact} (3σ ${3 * sigma})`).toBeLessThanOrEqual(3 * sigma);
  });
});

/** 합성 타석: 이닝·득점·승리확률만 정한다 (득점 r점은 주자 r−1명 있는 홈런, 0점은 삼진) */
function fakePa(index: number, opts: { inning: number; runs: number; wp?: readonly [number, number] }): PlayoutPA {
  const bases = [0, 0, 0b001, 0b011, 0b111][opts.runs];
  const event = opts.runs === 0 ? EV.K : EV.HR;
  const before = at({ inning: opts.inning, bases });
  const transition = transitions(bases, 0, event)[0];
  const { state: after, over } = applyTransition(before, transition);
  return {
    index,
    before,
    after,
    batSide: 'away',
    batterId: 'a1',
    pitcherId: 'hp',
    event,
    transition,
    pitches: [],
    wpHomeBefore: opts.wp ? opts.wp[0] : null,
    wpHomeAfter: opts.wp ? opts.wp[1] : null,
    tieAfter: opts.wp ? 0 : null,
    over,
  };
}

function fakeResult(pas: PlayoutPA[]): PlayoutResult {
  return { plateAppearances: pas, final: pas[pas.length - 1].after, winner: 'away', walkoff: false, truncated: false };
}

describe('pickHighlights', SLOW, () => {
  it('첫·마지막 타석을 넣고, 승리확률 변화 ≥ 0.05이거나 7회 이후 득점한 타석을 변화량이 큰 순으로 채워 오름차순으로 돌려준다', () => {
    const result = fakeResult([
      fakePa(0, { inning: 1, runs: 0, wp: [0.5, 0.49] }),
      fakePa(1, { inning: 3, runs: 0, wp: [0.49, 0.47] }), // 변화 0.02: 제외
      fakePa(2, { inning: 2, runs: 3, wp: [0.47, 0.17] }), // 0.30
      fakePa(3, { inning: 4, runs: 0, wp: [0.17, 0.23] }), // 0.06
      fakePa(4, { inning: 8, runs: 1, wp: [0.23, 0.22] }), // 0.01이지만 7회 이후 득점
      fakePa(5, { inning: 8, runs: 2, wp: [0.22, 0.72] }), // 0.50
      fakePa(6, { inning: 5, runs: 1, wp: [0.72, 0.671] }), // 0.049, 7회 전 득점: 제외
      fakePa(7, { inning: 9, runs: 0, wp: [0.671, 1] }),
    ]);
    expect(pickHighlights(result)).toEqual([0, 2, 3, 4, 5, 7]);
    expect(pickHighlights(result, 5)).toEqual([0, 2, 3, 5, 7]);
    expect(pickHighlights(result, 4)).toEqual([0, 2, 5, 7]);
  });

  it('승리확률이 없으면 7회 이후 득점한 타석을 득점 많은 순으로 채운다', () => {
    const result = fakeResult([
      fakePa(0, { inning: 6, runs: 0 }),
      fakePa(1, { inning: 8, runs: 1 }),
      fakePa(2, { inning: 9, runs: 4 }),
      fakePa(3, { inning: 5, runs: 3 }), // 7회 전: 제외
      fakePa(4, { inning: 7, runs: 2 }),
      fakePa(5, { inning: 9, runs: 0 }),
    ]);
    expect(pickHighlights(result, 4)).toEqual([0, 2, 4, 5]);
    expect(pickHighlights(result)).toEqual([0, 1, 2, 4, 5]);
  });

  it('타석이 하나면 [0], max가 1이면 첫 타석만', () => {
    expect(pickHighlights(fakeResult([fakePa(0, { inning: 9, runs: 1 })]))).toEqual([0]);
    const two = fakeResult([fakePa(0, { inning: 9, runs: 0 }), fakePa(1, { inning: 9, runs: 1 })]);
    expect(pickHighlights(two)).toEqual([0, 1]);
    expect(pickHighlights(two, 1)).toEqual([0]);
  });

  it('실제 재생 결과에서도 0과 마지막 타석을 넣고 길이 ≤ max, 오름차순, 중복 없음', () => {
    const rng = createRng(5);
    for (let n = 0; n < 12; n++) {
      const result = playout(
        input({ start: n % 2 ? at({}) : SEVENTH, scenePitcher: HP, rng, trackWinProbability: n % 3 === 0, countTable: null }),
      );
      const last = result.plateAppearances.length - 1;
      for (const max of [2, 3, 6, 10]) {
        const picks = pickHighlights(result, max);
        expect(picks[0]).toBe(0);
        expect(picks).toContain(last);
        expect(picks.length).toBeLessThanOrEqual(max);
        expect([...picks].sort((a, b) => a - b)).toEqual(picks);
        expect(new Set(picks).size).toBe(picks.length);
      }
      expect(pickHighlights(result)).toEqual(pickHighlights(result, 6));
    }
  });
});

describe('expectedCounts', () => {
  it('{ winHome: 0.2845, tie: 0.035, winAway: 0.6805 } → { home: 285, tie: 35, away: 680 }', () => {
    expect(expectedCounts({ winHome: 0.2845, tie: 0.035, winAway: 0.6805 })).toEqual({ home: 285, tie: 35, away: 680 });
  });

  it('내림한 뒤 남는 수는 소수부가 큰 순, 같으면 home → tie → away 순으로 나눈다', () => {
    expect(expectedCounts({ winHome: 1 / 3, tie: 1 / 3, winAway: 1 / 3 })).toEqual({ home: 334, tie: 333, away: 333 });
    expect(expectedCounts({ winHome: 1 / 3, tie: 1 / 3, winAway: 1 / 3 }, 1001)).toEqual({ home: 334, tie: 334, away: 333 });
    expect(expectedCounts({ winHome: 0.1234, tie: 0.0006, winAway: 0.876 })).toEqual({ home: 123, tie: 1, away: 876 });
    expect(expectedCounts({ winHome: 0.5, tie: 0, winAway: 0.5 })).toEqual({ home: 500, tie: 0, away: 500 });
    expect(expectedCounts({ winHome: 1, tie: 0, winAway: 0 })).toEqual({ home: 1000, tie: 0, away: 0 });
  });

  it('합은 항상 정확히 n이고 각 값은 확률 × n과 1 미만 차이', () => {
    const rng = createRng(11);
    for (let k = 0; k < 500; k++) {
      const a = rng();
      const b = rng() * 0.1;
      const c = rng();
      const total = a + b + c;
      const probs = { winHome: a / total, tie: b / total, winAway: 1 - a / total - b / total };
      for (const n of [1000, 1, 7, 12345]) {
        const counts = expectedCounts(probs, n);
        expect(counts.home + counts.tie + counts.away).toBe(n);
        expect(Math.min(counts.home, counts.tie, counts.away)).toBeGreaterThanOrEqual(0);
        expect(Math.abs(counts.home - probs.winHome * n)).toBeLessThan(1);
        expect(Math.abs(counts.tie - probs.tie * n)).toBeLessThan(1);
        expect(Math.abs(counts.away - Math.max(0, probs.winAway) * n)).toBeLessThan(1);
      }
    }
  });

  it('n이 0 이상 정수가 아니면 RangeError, n = 0이면 모두 0', () => {
    const probs = { winHome: 0.1, tie: 0, winAway: 0.9 };
    expect(() => expectedCounts(probs, -10)).toThrow(RangeError);
    expect(() => expectedCounts(probs, 2.5)).toThrow(RangeError);
    expect(expectedCounts(probs, 0)).toEqual({ home: 0, tie: 0, away: 0 });
  });
});
