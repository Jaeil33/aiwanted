import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { fixtureAppData, fixtureSituation } from '../test/fixtures/appData';
import type { EventIndex, GameState, KnobPart, SceneContext, Transition } from '../types/domain';
import { compileKnobPart } from './effects';
import {
  DMAX,
  MAX_INN,
  applyTransition,
  createGame,
  gaugesAtCount,
  startNextHalf,
  type Evaluation,
  type Game,
  type GameConfig,
  type LineupSlot,
  type TeamConfig,
} from './game';
import { transitions } from './transitions';

const { core } = fixtureAppData;
const SCENE = fixtureSituation;
const LG = core.league;
const ONES = [1, 1, 1, 1, 1, 1, 1];
const EVENTS: readonly EventIndex[] = [0, 1, 2, 3, 4, 5, 6];
/** createGame·상세 평가는 수백 ms가 걸린다 */
const SLOW = { timeout: 60_000 };

const player = (id: string): LineupSlot => ({ id, rel: core.players[id].rel });
const bullpen = (code: string): LineupSlot => ({ id: core.bullpens[code].id, rel: core.bullpens[code].rel });
const AWAY: TeamConfig = { lineup: SCENE.lineups.away.map(player), bullpen: bullpen('HT') };
const HOME: TeamConfig = { lineup: SCENE.lineups.home.map(player), bullpen: bullpen('LT') };
/** 원정 투수 ap: 말 공격(홈 타자)을 상대한다 */
const AP = player('ap');
/** 홈 투수 hp: 초 공격(원정 타자)을 상대한다 */
const HP = player('hp');
const SCENE_CTX: SceneContext = { batterId: SCENE.batter, pitcherId: SCENE.pitcher, batSide: 'home' };

const flatTeam = (prefix: string): TeamConfig => ({
  lineup: Array.from({ length: 9 }, (_, i) => ({ id: `${prefix}${i + 1}`, rel: ONES })),
  bullpen: { id: `${prefix}-pen`, rel: ONES },
});

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

const config = (over: Partial<GameConfig> = {}): GameConfig => ({
  lg: LG,
  away: AWAY,
  home: HOME,
  effects: [],
  mode: 'real',
  countTable: core.countTable,
  ...over,
});

function knob(id: KnobPart['knob'], subject: KnobPart['subject'], strength: number, scope: KnobPart['scope'] = 'game'): KnobPart {
  return { kind: 'knob', knob: id, subject, strength, scope, evidence: 'fun', why: '테스트' };
}

/** createGame은 무거우니 설정마다 한 번만 만든다 */
function once(make: () => Game): () => Game {
  let game: Game | null = null;
  return () => (game ??= make());
}

const fixtureGame = once(() => createGame(config()));
/** 두 팀 타선·불펜이 완전히 같은 경기 (카운트 표 없음) */
const mirrorGame = once(() => createGame(config({ away: flatTeam('a'), home: flatTeam('h'), countTable: null })));

/** 여러 상황: [이름, 상태, 그 반이닝 투수] */
const STATES: readonly (readonly [string, GameState, LineupSlot])[] = [
  ['장면 9회말 2사 만루 4:4', SCENE.state, AP],
  ['1회초 0:0', at({}), HP],
  ['7회초 1사 1루 2:3', at({ inning: 7, half: 0, outs: 1, bases: 0b001, away: 2, home: 3, slotAway: 3, slotHome: 6 }), HP],
  ['8회말 1사 1·2루 3:2', at({ inning: 8, half: 1, outs: 1, bases: 0b011, away: 3, home: 2, slotAway: 6, slotHome: 4 }), AP],
  ['10회초 2사 1·3루 5:5', at({ inning: 10, half: 0, outs: 2, bases: 0b101, away: 5, home: 5, slotAway: 7, slotHome: 1 }), HP],
  ['11회말 무사 3루 6:6', at({ inning: 11, half: 1, outs: 0, bases: 0b100, away: 6, home: 6, slotAway: 2, slotHome: 8 }), AP],
];

const evaluations = new Map<string, Evaluation>();
/** 픽스처 경기의 상세 평가를 상황마다 한 번만 계산한다 */
function evaluateFixture(label: string, st: GameState, pitcher: LineupSlot): Evaluation {
  let ev = evaluations.get(label);
  if (!ev) {
    ev = fixtureGame().evaluate(st, pitcher);
    evaluations.set(label, ev);
  }
  return ev;
}

function near(actual: number, expected: number, tol: number, label = '') {
  expect(Math.abs(actual - expected), `${label} ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

const mix = (ev: Evaluation, key: 'winHome' | 'tie' | 'inningScore') =>
  EVENTS.reduce<number>((total, e) => total + ev.pa[e] * ev.after[e][key], 0);

function branch(bases: number, outs: number, e: EventIndex, pick: (x: Transition) => boolean = () => true): Transition {
  const found = transitions(bases, outs, e).find(pick);
  if (!found) throw new Error(`분기 없음 ${bases}/${outs}/${e}`);
  return found;
}

describe('상수', () => {
  it('KBO 정규시즌 11회 무승부, 점수차 상한 20', () => {
    expect(MAX_INN).toBe(11);
    expect(DMAX).toBe(20);
  });
});

describe('createGame · evaluate', SLOW, () => {
  it('평가 결과: 공격 진영, 합 1인 확률, 사건 7개의 after, 카운트 모델', () => {
    const [label, st, pitcher] = STATES[0];
    const ev = evaluateFixture(label, st, pitcher);
    expect(ev.batSide).toBe('home');
    expect(ev.pa).toBeInstanceOf(Float64Array);
    near(ev.pa.reduce((a, b) => a + b, 0), 1, 1e-12, 'pa 합');
    near(ev.batterWin + ev.pitcherWin, 1, 1e-15, '타석');
    near(ev.winHome + ev.tie + ev.winAway, 1, 1e-12, '경기');
    expect(ev.after).toHaveLength(7);
    expect(ev.count).not.toBeNull();
    expect(ev.count?.term).toHaveLength(12);
    const probs = [ev.batterWin, ev.inningScore, ev.winHome, ev.tie, ev.winAway];
    for (const a of ev.after) probs.push(a.winHome, a.tie, a.winAway, a.inningScore);
    for (const p of probs) {
      expect(p).toBeGreaterThanOrEqual(-1e-12);
      expect(p).toBeLessThanOrEqual(1 + 1e-12);
    }
    expect(ev.expRuns).toBeGreaterThan(0);
    expect(fixtureGame().evaluate(at({}), HP, { detail: false }).batSide).toBe('away');
  });

  it('두 팀 타선·불펜이 완전히 같으면 1회초 0:0에서 홈·원정 승리확률이 같고 세 확률 합은 1', () => {
    const ev = mirrorGame().evaluate(at({}), flatTeam('h').bullpen, { detail: false });
    near(ev.winHome, ev.winAway, 1e-9, '홈 vs 원정');
    near(ev.winHome + ev.tie + ev.winAway, 1, 1e-9, '합');
    expect(ev.tie).toBeGreaterThan(0);
    expect(ev.tie).toBeLessThan(0.1);
  });

  it.each(STATES)('혼합 항등식(%s): Σ pa[e] × after[e]가 winHome·tie·inningScore와 같다', (label, st, pitcher) => {
    const ev = evaluateFixture(label, st, pitcher);
    near(mix(ev, 'winHome'), ev.winHome, 1e-9, 'winHome');
    near(mix(ev, 'tie'), ev.tie, 1e-9, 'tie');
    near(mix(ev, 'inningScore'), ev.inningScore, 1e-9, 'inningScore');
  });

  it.each(STATES)('gaugesAtCount(ev, 0, 0)은 평가 값과 같다(%s)', (label, st, pitcher) => {
    const ev = evaluateFixture(label, st, pitcher);
    const g = gaugesAtCount(ev, 0, 0);
    near(g.batterWin, ev.batterWin, 1e-9, 'batterWin');
    near(g.inningScore, ev.inningScore, 1e-9, 'inningScore');
    near(g.winHome, ev.winHome, 1e-9, 'winHome');
    near(g.tie, ev.tie, 1e-9, 'tie');
    near(g.winHome + g.tie + g.winAway, 1, 1e-12, '합');
    expect(g.dist).toBeInstanceOf(Float64Array);
  });

  it('볼카운트가 공격 팀 쪽으로 기울면 공격 팀 승리확률이 오른다: 3-0 > 0-0 > 0-2', () => {
    const [label, st, pitcher] = STATES[3];
    const ev = evaluateFixture(label, st, pitcher);
    expect(gaugesAtCount(ev, 3, 0).winHome).toBeGreaterThan(gaugesAtCount(ev, 0, 0).winHome);
    expect(gaugesAtCount(ev, 0, 0).winHome).toBeGreaterThan(gaugesAtCount(ev, 0, 2).winHome);
  });

  it('카운트 모델이 없으면(detail: false 또는 countTable 없음) gaugesAtCount는 Error', () => {
    expect(() => gaugesAtCount(fixtureGame().evaluate(SCENE.state, AP, { detail: false }), 0, 0)).toThrow(Error);
    const noTable = mirrorGame().evaluate(at({ inning: 9, half: 1, outs: 2, away: 1, home: 1 }), flatTeam('a').bullpen);
    expect(noTable.count).toBeNull();
    expect(() => gaugesAtCount(noTable, 0, 0)).toThrow(Error);
  });

  it('9회초 홈팀 5점 리드에서 홈 승리확률은 0.97보다 크다', () => {
    const ev = fixtureGame().evaluate(at({ inning: 9, half: 0, away: 0, home: 5, slotAway: 4, slotHome: 2 }), HP, { detail: false });
    expect(ev.winHome).toBeGreaterThan(0.97);
  });

  it('9회말 동점 2사 만루에서 홈런·밀어내기 볼넷 뒤 홈 승리확률은 정확히 1', () => {
    const [label, st, pitcher] = STATES[0];
    const ev = evaluateFixture(label, st, pitcher);
    expect(ev.after[EV.HR].winHome).toBe(1);
    expect(ev.after[EV.HR].tie).toBe(0);
    expect(ev.after[EV.HR].winAway).toBe(0);
    expect(ev.after[EV.BB].winHome).toBe(1);
    expect(ev.after[EV.K].winHome).toBeLessThan(1);
  });

  it('11회말 동점 2사 주자 없음에서 삼진이면 무승부 확률은 정확히 1', () => {
    const ev = fixtureGame().evaluate(at({ inning: 11, half: 1, outs: 2, away: 6, home: 6, slotAway: 4, slotHome: 2 }), AP);
    expect(ev.after[EV.K].tie).toBe(1);
    expect(ev.after[EV.K].winHome).toBe(0);
  });

  it('detail: false는 after·count를 건너뛰고 pa·winHome·tie·inningScore는 detail: true와 같다', () => {
    for (const [label, st, pitcher] of STATES) {
      const full = evaluateFixture(label, st, pitcher);
      const fast = fixtureGame().evaluate(st, pitcher, { detail: false });
      expect(fast.after).toEqual([]);
      expect(fast.count).toBeNull();
      expect(Array.from(fast.pa)).toEqual(Array.from(full.pa));
      expect(fast.winHome).toBe(full.winHome);
      expect(fast.tie).toBe(full.tie);
      expect(fast.inningScore).toBe(full.inningScore);
      expect(fast.expRuns).toBe(full.expRuns);
    }
  });

  it('장면 타자에게 contact +3을 주면 타석·이닝·공격 팀 승리확률이 모두 오르고 만화 모드는 더 오른다', () => {
    const effects = compileKnobPart(knob('contact', 'batter', 3), SCENE_CTX, 'tmi-1');
    const base = fixtureGame().evaluate(SCENE.state, AP, { detail: false });
    const real = createGame(config({ effects })).evaluate(SCENE.state, AP, { detail: false });
    const toon = createGame(config({ effects, mode: 'toon' })).evaluate(SCENE.state, AP, { detail: false });
    expect(real.batterWin).toBeGreaterThan(base.batterWin);
    expect(real.inningScore).toBeGreaterThan(base.inningScore);
    expect(real.winHome).toBeGreaterThan(base.winHome);
    expect(toon.batterWin).toBeGreaterThan(real.batterWin);
    expect(toon.inningScore).toBeGreaterThan(real.inningScore);
    expect(toon.winHome).toBeGreaterThan(real.winHome);
  });

  it("scope 'pa' 효과는 first(기본 true)일 때 현재 타석에만 쓰고 first: false면 쓰지 않는다", () => {
    const effects = compileKnobPart(knob('stuff', 'pitcher', -3, 'pa'), SCENE_CTX, 'tmi-2');
    const game = createGame(config({ effects }));
    const base = fixtureGame().evaluate(SCENE.state, AP, { detail: false });
    const first = game.evaluate(SCENE.state, AP, { detail: false });
    const later = game.evaluate(SCENE.state, AP, { first: false, detail: false });
    expect(first.batterWin).toBeGreaterThan(base.batterWin);
    expect(first.winHome).toBeGreaterThan(base.winHome);
    expect(Array.from(later.pa)).toEqual(Array.from(base.pa));
    expect(later.winHome).toBe(base.winHome);
  });

  it('현재 반이닝은 넘겨준 투수가, 이후 반이닝은 수비 팀 불펜이 던진다', () => {
    const strong = [2, 0.6, 0.5, 1, 0.8, 0.8, 1.1];
    const game = createGame(config({ home: { ...HOME, bullpen: { id: 'LT-pen', rel: strong } } }));
    const st = at({ inning: 8, half: 0, outs: 0, away: 3, home: 3, slotAway: 2, slotHome: 5 });
    const base = fixtureGame().evaluate(st, HP, { detail: false });
    const strongPen = game.evaluate(st, HP, { detail: false });
    expect(Array.from(strongPen.pa)).toEqual(Array.from(base.pa));
    expect(strongPen.inningScore).toBe(base.inningScore);
    expect(strongPen.winHome).toBeGreaterThan(base.winHome);
    const ace = game.evaluate(st, { id: 'ace', rel: strong }, { detail: false });
    expect(ace.inningScore).toBeLessThan(strongPen.inningScore);
  });

  it('반이닝이 끝난(3아웃) 상태는 RangeError: startNextHalf로 다음 반이닝을 만든 뒤 평가한다', () => {
    expect(() => fixtureGame().evaluate(at({ outs: 3 }), HP)).toThrow(RangeError);
  });

  it('타선이 9명이 아니면 RangeError', () => {
    expect(() => createGame(config({ away: { ...AWAY, lineup: AWAY.lineup.slice(0, 8) } }))).toThrow(RangeError);
  });
});

describe('applyTransition · startNextHalf', () => {
  it('9회말 동점 만루 홈런은 끝내기: 점수·주자·아웃·타순을 반영하고 walkoff true', () => {
    const { state, over } = applyTransition(SCENE.state, branch(0b111, 2, EV.HR));
    expect(state).toEqual({ ...SCENE.state, home: 8, bases: 0, outs: 2, slotHome: 6 });
    expect(over).toEqual({ kind: 'game', winner: 'home', walkoff: true });
  });

  it('9회말 동점 만루 밀어내기 볼넷도 끝내기', () => {
    const { state, over } = applyTransition(SCENE.state, branch(0b111, 2, EV.BB));
    expect(state).toMatchObject({ home: 5, bases: 0b111, outs: 2 });
    expect(over).toEqual({ kind: 'game', winner: 'home', walkoff: true });
  });

  it('9회초 3아웃에 홈팀이 앞서면 말 공격 없이 경기 종료', () => {
    const before = at({ inning: 9, half: 0, outs: 2, bases: 0b011, away: 3, home: 5, slotAway: 8, slotHome: 4 });
    const { state, over } = applyTransition(before, branch(0b011, 2, EV.K));
    expect(state).toEqual({ ...before, outs: 3, bases: 0, slotAway: 0 });
    expect(over).toEqual({ kind: 'game', winner: 'home', walkoff: false });
  });

  it('9회말 3아웃에 원정팀이 앞서면 원정 승', () => {
    const { over } = applyTransition(at({ inning: 9, half: 1, outs: 2, away: 5, home: 3 }), branch(0, 2, EV.K));
    expect(over).toEqual({ kind: 'game', winner: 'away', walkoff: false });
  });

  it('11회말 3아웃 동점이면 무승부', () => {
    const { state, over } = applyTransition(at({ inning: 11, half: 1, outs: 2, bases: 0b001, away: 6, home: 6 }), branch(0b001, 2, EV.OUT));
    expect(state).toMatchObject({ outs: 3, bases: 0, away: 6, home: 6 });
    expect(over).toEqual({ kind: 'game', winner: 'tie', walkoff: false });
  });

  it('9회초 동점·10회말 동점 3아웃은 반이닝 종료이고 경기는 이어진다', () => {
    expect(applyTransition(at({ inning: 9, half: 0, outs: 2, away: 4, home: 4 }), branch(0, 2, EV.K)).over).toEqual({ kind: 'half' });
    expect(applyTransition(at({ inning: 10, half: 1, outs: 2, away: 4, home: 4 }), branch(0, 2, EV.K)).over).toEqual({ kind: 'half' });
  });

  it('8회말 이전의 역전 홈런은 끝내기가 아니다', () => {
    const { state, over } = applyTransition(at({ inning: 8, half: 1, away: 2, home: 2, slotHome: 3 }), branch(0, 0, EV.HR));
    expect(state).toMatchObject({ home: 3, outs: 0, bases: 0, slotHome: 4 });
    expect(over).toBeNull();
  });

  it('득점·아웃·주자·공격 팀 타순만 바꾸고 입력 state는 바꾸지 않는다', () => {
    const original = at({ inning: 5, half: 0, outs: 1, bases: 0b110, away: 1, home: 2, slotAway: 8, slotHome: 4 });
    const before = Object.freeze({ ...original });
    const tr = branch(0b110, 1, EV.S1, (x) => x.runs === 2);
    const { state, over } = applyTransition(before, tr);
    expect(state).toEqual({ ...original, away: 3, bases: tr.bases, outs: 1, slotAway: 0 });
    expect(before).toEqual(original);
    expect(over).toBeNull();
  });

  it('startNextHalf: 초 → 같은 이닝 말, 말 → 다음 이닝 초, 아웃·주자 0, 점수·타순 유지', () => {
    const top = applyTransition(at({ inning: 3, half: 0, outs: 2, bases: 0b011, away: 2, home: 1, slotAway: 5, slotHome: 7 }), branch(0b011, 2, EV.K));
    expect(top.over).toEqual({ kind: 'half' });
    expect(startNextHalf(top.state)).toEqual({ inning: 3, half: 1, outs: 0, bases: 0, away: 2, home: 1, slotAway: 6, slotHome: 7 });

    const bottom = applyTransition(at({ inning: 3, half: 1, outs: 2, away: 2, home: 1, slotAway: 6, slotHome: 7 }), branch(0, 2, EV.OUT));
    expect(bottom.over).toEqual({ kind: 'half' });
    const frozen = Object.freeze({ ...bottom.state });
    expect(startNextHalf(frozen)).toEqual({ inning: 4, half: 0, outs: 0, bases: 0, away: 2, home: 1, slotAway: 6, slotHome: 8 });
    expect(frozen).toEqual(bottom.state);
  });
});
