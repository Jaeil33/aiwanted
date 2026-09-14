import { describe, expect, it, vi } from 'vitest';
import { measuredById, transformValue } from '../domain/measured';
import { fixtureAppData } from '../test/fixtures/appData';
import type { EvidenceData, EvidenceItem } from '../types/data';
import type { EffectPart, KnobPart, MeasuredId, MeasuredPart, SceneContext, Subject } from '../types/domain';
import { compileKnobPart, effectMultipliers } from './effects';
import { halfInning, halfSummary } from './halfInning';
import { KNOB_WEIGHTS } from './knobs';
import { matchup } from './matchup';
import { OFFENSE_W, compileEffects, compileMeasuredPart, measuredRunsRatio, runsElasticity } from './measured';

// runsElasticity 캐시를 확인하려고 halfInning 호출 수를 센다 (계산은 실제 함수 그대로)
vi.mock('./halfInning', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./halfInning')>();
  return { ...actual, halfInning: vi.fn(actual.halfInning) };
});

const { core, evidence } = fixtureAppData;
const LG = core.league;
const ONES = [1, 1, 1, 1, 1, 1, 1];
/** 픽스처 장면: 9회말 홈 공격, 홈타자 h6 대 원정투수 ap */
const SCENE: SceneContext = { batterId: 'h6', pitcherId: 'ap', batSide: 'home' };

function near(actual: number, expected: number, tol: number, label = '') {
  expect(Math.abs(actual - expected), `${label} ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

function expectVector(actual: ArrayLike<number>, expected: readonly number[], tol = 1e-12) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((x, i) => near(actual[i], x, tol, `index ${i}`));
}

function measured(variable: MeasuredId, value: number, subject: Subject = 'everyone'): MeasuredPart {
  return { kind: 'measured', variable, value, subject, why: '테스트' };
}

/** 합성 evidence 항목 (beta만 의미가 있다) */
function item(id: MeasuredId, beta: number): EvidenceItem {
  return {
    id,
    beta,
    se: 0.01,
    ciLow: beta - 0.02,
    ciHigh: beta + 0.02,
    runsPctPerUnit: (Math.exp(beta) - 1) * 100,
    n: 1000,
    test: { devianceGainPerGame: 0, ciLow: -0.001, ciHigh: 0.001, games: 600 },
    verdict: 'maybe',
    note: '합성 테스트 항목',
  };
}

/** 픽스처 evidence에 항목을 더하거나 같은 id를 바꾼다 */
function evidenceWith(...items: EvidenceItem[]): EvidenceData {
  if (!evidence) throw new Error('픽스처 evidence가 없다');
  const ids = new Set(items.map((x) => x.id));
  return { ...evidence, items: [...evidence.items.filter((x) => !ids.has(x.id)), ...items] };
}

function fixtureBeta(id: MeasuredId): number {
  const found = evidence?.items.find((x) => x.id === id);
  if (!found) throw new Error(`픽스처 evidence에 ${id}가 없다`);
  return found.beta;
}

/** 리그 평균 타선(9명 rel 1, 투수 rel 1)의 무사 주자 없음 반이닝 기대 득점 */
function leagueExpRuns(mult?: ArrayLike<number>): number {
  const dist = matchup(ONES, ONES, LG, mult);
  return halfSummary(halfInning(Array.from({ length: 9 }, () => dist), { slot: 0, outs: 0, bases: 0 })).expRuns;
}

describe('OFFENSE_W', () => {
  it('공격 전반 벡터는 팀 분위기(mood) 가중치다', () => {
    expect([...OFFENSE_W]).toEqual([...KNOB_WEIGHTS.mood]);
  });
});

describe('runsElasticity', () => {
  it('양수이고, 리그 평균 타선 로그 기대 득점의 중앙 차분(h = 0.01)과 같다', () => {
    const elasticity = runsElasticity(LG);
    expect(elasticity).toBeGreaterThan(0);
    const h = 0.01;
    const up = leagueExpRuns(OFFENSE_W.map((w) => Math.exp(h * w)));
    const down = leagueExpRuns(OFFENSE_W.map((w) => Math.exp(-h * w)));
    near(elasticity, (Math.log(up) - Math.log(down)) / (2 * h), 1e-12);
  });

  it('같은 lg 값이면 두 번째 호출은 반이닝을 다시 계산하지 않고 같은 값을 돌려준다', () => {
    const lg = [0.21, 0.085, 0.03, 0.005, 0.05, 0.14, 0.48];
    const spy = vi.mocked(halfInning);
    spy.mockClear();
    const first = runsElasticity(lg);
    const calls = spy.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(runsElasticity([...lg])).toBe(first);
    expect(spy.mock.calls.length).toBe(calls);
    runsElasticity([0.19, 0.1, 0.02, 0.004, 0.046, 0.16, 0.48]);
    expect(spy.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe('measuredRunsRatio', () => {
  it('득점 배수 = exp(beta × transformValue(def, value))', () => {
    const temp = measuredById('temp_c');
    const warm = item('temp_c', 0.021);
    near(measuredRunsRatio(temp, warm, 30), Math.exp(0.021), 1e-15, '30°C');
    near(measuredRunsRatio(temp, warm, 55), Math.exp(0.021 * transformValue(temp, 55)), 1e-15, '40°C에서 자름');
    expect(measuredRunsRatio(temp, warm, 20)).toBe(1);
    near(measuredRunsRatio(measuredById('day_game'), item('day_game', -0.004), 1), Math.exp(-0.004), 1e-15, '낮 경기');
  });
});

describe('compileMeasuredPart', () => {
  it('득점 배수 1.10 효과를 모든 타자에 적용하면 무사 주자 없음 반이닝 기대 득점이 +10%(±1.5%p)', () => {
    const ev = evidenceWith(item('day_game', Math.log(1.1)));
    const effects = compileMeasuredPart(measured('day_game', 1), SCENE, ev, LG, 'tmi-1');
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ applies: { on: 'all' }, scope: 'game', sourceId: 'tmi-1' });
    const scale = Math.log(1.1) / runsElasticity(LG);
    expectVector(effects[0].logOdds, OFFENSE_W.map((w) => scale * w));

    const mult = effectMultipliers(effects, { batterId: 'x1', pitcherId: 'y1', batSide: 'away', first: false }, 'real');
    const ratio = leagueExpRuns(mult) / leagueExpRuns();
    expect(Math.abs(ratio - 1.1), `기대 득점 배수 ${ratio}`).toBeLessThanOrEqual(0.015);
  });

  it('효과 크기는 evidence의 beta와 변환값에서만 온다: temp_c 30°C는 1단위, 55°C는 40°C에서 잘려 2단위', () => {
    const beta = fixtureBeta('temp_c');
    const elasticity = runsElasticity(LG);
    const warm = compileMeasuredPart(measured('temp_c', 30), SCENE, evidence, LG, 't');
    expectVector(warm[0].logOdds, OFFENSE_W.map((w) => ((beta * 1) / elasticity) * w));
    const hot = compileMeasuredPart(measured('temp_c', 55), SCENE, evidence, LG, 't');
    expectVector(hot[0].logOdds, OFFENSE_W.map((w) => ((beta * 2) / elasticity) * w));
  });

  it.each([
    ['home은 applicable false', measured('home', 1, 'battingTeam'), evidenceWith(item('home', 0.05))],
    ['evidence null', measured('temp_c', 30), null],
    ['evidence에 항목 없음', measured('wind_ms', 8), evidence],
    ['값 NaN', measured('temp_c', Number.NaN), evidence],
    ['값 Infinity', measured('temp_c', Number.POSITIVE_INFINITY), evidence],
    ['알 수 없는 변수', measured('humidity' as MeasuredId, 80), evidence],
    ['beta가 유한수가 아님', measured('temp_c', 30), evidenceWith(item('temp_c', Number.NaN))],
    ['상대 선발 변수에 everyone', measured('starter_short_rest', 1, 'everyone'), evidenceWith(item('starter_short_rest', 0.04))],
    ['팀 변수에 알 수 없는 대상', measured('travel_km', 400, 'umpire' as Subject), evidenceWith(item('travel_km', -0.03))],
  ])('적용할 수 없으면 []: %s', (_label, part, ev) => {
    expect(compileMeasuredPart(part, SCENE, ev, LG, 'x')).toEqual([]);
  });

  it('env 변수는 대상과 상관없이 모두에게 적용된다', () => {
    const subjects: Subject[] = ['everyone', 'batter', 'fieldingTeam', 'umpire' as Subject];
    for (const subject of subjects) {
      expect(compileMeasuredPart(measured('temp_c', 30, subject), SCENE, evidence, LG, 's')[0].applies).toEqual({ on: 'all' });
    }
  });

  it('team 변수는 그 팀의 득점: 타자·공격팀은 공격 진영, 투수·수비팀은 반대편 진영이 공격할 때, everyone은 모두', () => {
    const ev = evidenceWith(item('travel_km', -0.03));
    const applies = (subject: Subject, ctx: SceneContext = SCENE) =>
      compileMeasuredPart(measured('travel_km', 400, subject), ctx, ev, LG, 's')[0].applies;
    expect(applies('batter')).toEqual({ on: 'batting', side: 'home' });
    expect(applies('battingTeam')).toEqual({ on: 'batting', side: 'home' });
    expect(applies('pitcher')).toEqual({ on: 'batting', side: 'away' });
    expect(applies('fieldingTeam')).toEqual({ on: 'batting', side: 'away' });
    expect(applies('everyone')).toEqual({ on: 'all' });
    expect(applies('battingTeam', { ...SCENE, batSide: 'away' })).toEqual({ on: 'batting', side: 'away' });
  });

  it('opponentStarter 변수는 그 선발을 상대하는 팀의 득점: 투수·수비팀이면 반대편이 수비할 때, 타자·공격팀이면 공격 진영이 수비할 때', () => {
    const ev = evidenceWith(item('starter_short_rest', 0.04));
    const compile = (subject: Subject) => compileMeasuredPart(measured('starter_short_rest', 1, subject), SCENE, ev, LG, 's');
    expect(compile('pitcher')[0].applies).toEqual({ on: 'fielding', side: 'away' });
    expect(compile('fieldingTeam')[0].applies).toEqual({ on: 'fielding', side: 'away' });
    expect(compile('batter')[0].applies).toEqual({ on: 'fielding', side: 'home' });
    expect(compile('battingTeam')[0].applies).toEqual({ on: 'fielding', side: 'home' });

    // 장면 투수(원정 선발)의 짧은 휴식은 홈 타자 타석의 득점을 바꾸고, 원정 타자 타석은 그대로 둔다
    const effects = compile('pitcher');
    expect(effectMultipliers(effects, { batterId: 'h1', pitcherId: 'HT-pen', batSide: 'home', first: false }, 'real')[0]).not.toBe(1);
    expect(Array.from(effectMultipliers(effects, { batterId: 'a1', pitcherId: 'LT-pen', batSide: 'away', first: false }, 'real'))).toEqual(ONES);
  });
});

describe('compileEffects', () => {
  it('knob·measured가 섞인 parts를 순서대로 엔진 효과로 바꿔 이어 붙인다', () => {
    const mood: KnobPart = { kind: 'knob', knob: 'mood', subject: 'battingTeam', strength: 2, scope: 'game', evidence: 'plausible', why: '' };
    const power: KnobPart = { kind: 'knob', knob: 'power', subject: 'batter', strength: 1, scope: 'pa', evidence: 'fun', why: '' };
    const temp = measured('temp_c', 33);
    const parts: EffectPart[] = [temp, mood, measured('home', 1, 'battingTeam'), power];
    const out = compileEffects(parts, SCENE, { sourceId: 'tmi-9', evidence, lg: LG });
    expect(out).toEqual([
      ...compileMeasuredPart(temp, SCENE, evidence, LG, 'tmi-9'),
      ...compileKnobPart(mood, SCENE, 'tmi-9'),
      ...compileKnobPart(power, SCENE, 'tmi-9'),
    ]);
    expect(out.map((fx) => fx.applies.on)).toEqual(['all', 'batting', 'fielding', 'batter']);
    expect(out.every((fx) => fx.sourceId === 'tmi-9')).toBe(true);
  });

  it('parts가 없거나 모두 적용할 수 없으면 []', () => {
    expect(compileEffects([], SCENE, { sourceId: 's', evidence, lg: LG })).toEqual([]);
    expect(compileEffects([measured('temp_c', 30)], SCENE, { sourceId: 's', evidence: null, lg: LG })).toEqual([]);
  });
});
