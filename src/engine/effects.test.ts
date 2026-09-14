import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import type { KnobId, KnobPart, SceneContext, Side, Subject } from '../types/domain';
import {
  REAL_LOG_CAP,
  TOON_FACTOR,
  TOON_LOG_CAP,
  appliesTo,
  compileKnobPart,
  effectMultipliers,
  fieldSideOf,
  type PaContext,
} from './effects';
import { KNOB_WEIGHTS, STEP } from './knobs';

const ONES = [1, 1, 1, 1, 1, 1, 1];

/** 픽스처 장면 기준: 9회말 홈 공격, 홈타자 h6 대 원정투수 ap */
const SCENE: SceneContext = { batterId: 'h6', pitcherId: 'ap', batSide: 'home' };
/** 원정 공격 장면: 원정타자 a4 대 홈투수 hp */
const AWAY_SCENE: SceneContext = { batterId: 'a4', pitcherId: 'hp', batSide: 'away' };

function part(knob: KnobId, subject: Subject, strength: number, scope: KnobPart['scope'] = 'game'): KnobPart {
  return { kind: 'knob', knob, subject, strength, scope, evidence: 'fun', why: '테스트' };
}

function pa(batterId: string, pitcherId: string, batSide: Side, first = false): PaContext {
  return { batterId, pitcherId, batSide, first };
}

function near(actual: number, expected: number, tol: number, label = '') {
  expect(Math.abs(actual - expected), `${label} ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

function expectVector(actual: ArrayLike<number>, expected: readonly number[], tol = 1e-12) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((x, i) => near(actual[i], x, tol, `index ${i}`));
}

/** STEP × 세기 × 손잡이 가중치 */
const scaled = (knob: KnobId, strength: number) => KNOB_WEIGHTS[knob].map((w) => STEP * strength * w);
const expOf = (xs: readonly number[]) => xs.map((x) => Math.exp(x));

describe('상수', () => {
  it('현실 상한 0.45, 만화 6배·상한 1.6', () => {
    expect(REAL_LOG_CAP).toBe(0.45);
    expect(TOON_FACTOR).toBe(6);
    expect(TOON_LOG_CAP).toBe(1.6);
  });
});

describe('fieldSideOf', () => {
  it('공격 진영의 반대편이 수비 진영이다', () => {
    expect(fieldSideOf('away')).toBe('home');
    expect(fieldSideOf('home')).toBe('away');
  });
});

describe('compileKnobPart', () => {
  it('타자 손잡이: batter는 장면 타자 id, battingTeam은 공격 진영, everyone은 모두', () => {
    const effects = compileKnobPart(part('power', 'batter', 2), SCENE, 'tmi-1');
    expect(effects).toHaveLength(1);
    const [fx] = effects;
    expect(fx.applies).toEqual({ on: 'batter', id: 'h6' });
    expectVector(fx.logOdds, scaled('power', 2));
    expect(fx.scope).toBe('game');
    expect(fx.sourceId).toBe('tmi-1');

    expect(compileKnobPart(part('contact', 'battingTeam', 1), SCENE, 's')[0].applies).toEqual({ on: 'batting', side: 'home' });
    expect(compileKnobPart(part('contact', 'battingTeam', 1), AWAY_SCENE, 's')[0].applies).toEqual({ on: 'batting', side: 'away' });
    expect(compileKnobPart(part('eye', 'everyone', -1), SCENE, 's')[0].applies).toEqual({ on: 'all' });
  });

  it('투수·수비 손잡이: pitcher는 장면 투수 id, fieldingTeam은 수비 진영, everyone은 모두', () => {
    expect(compileKnobPart(part('stuff', 'pitcher', 3), SCENE, 's')[0].applies).toEqual({ on: 'pitcher', id: 'ap' });
    expect(compileKnobPart(part('control', 'fieldingTeam', -2), SCENE, 's')[0].applies).toEqual({ on: 'fielding', side: 'away' });
    expect(compileKnobPart(part('control', 'fieldingTeam', -2), AWAY_SCENE, 's')[0].applies).toEqual({ on: 'fielding', side: 'home' });
    expect(compileKnobPart(part('nerve', 'everyone', 1), SCENE, 's')[0].applies).toEqual({ on: 'all' });
    expect(compileKnobPart(part('defense', 'fieldingTeam', 2), SCENE, 's')[0].applies).toEqual({ on: 'fielding', side: 'away' });
    expect(compileKnobPart(part('defense', 'everyone', 2), SCENE, 's')[0].applies).toEqual({ on: 'all' });
  });

  it('환경 손잡이는 항상 모두에게 적용된다', () => {
    for (const knob of ['carry', 'slick', 'glare'] as const) {
      const effects = compileKnobPart(part(knob, 'everyone', 2), SCENE, 'env');
      expect(effects).toHaveLength(1);
      expect(effects[0].applies).toEqual({ on: 'all' });
      expectVector(effects[0].logOdds, scaled(knob, 2));
    }
  });

  it('mood는 대상 팀이 공격할 때 +, 수비할 때 − 효과 두 개를 만든다', () => {
    const batting = compileKnobPart(part('mood', 'battingTeam', 2), SCENE, 'm1');
    expect(batting.map((fx) => fx.applies)).toEqual([
      { on: 'batting', side: 'home' },
      { on: 'fielding', side: 'home' },
    ]);
    expectVector(batting[0].logOdds, scaled('mood', 2));
    expectVector(batting[1].logOdds, scaled('mood', -2));
    expect(batting.every((fx) => fx.scope === 'game' && fx.sourceId === 'm1')).toBe(true);

    const fielding = compileKnobPart(part('mood', 'fieldingTeam', 1, 'pa'), SCENE, 'm2');
    expect(fielding.map((fx) => fx.applies)).toEqual([
      { on: 'batting', side: 'away' },
      { on: 'fielding', side: 'away' },
    ]);
    expect(fielding.every((fx) => fx.scope === 'pa' && fx.sourceId === 'm2')).toBe(true);
  });

  it('scope는 part 그대로 옮긴다', () => {
    expect(compileKnobPart(part('focus', 'batter', 1, 'pa'), SCENE, 's')[0].scope).toBe('pa');
    expect(compileKnobPart(part('focus', 'batter', 1, 'game'), SCENE, 's')[0].scope).toBe('game');
  });

  it('strength는 반올림한 뒤 −3..3으로 자른다', () => {
    expectVector(compileKnobPart(part('power', 'batter', 5), SCENE, 's')[0].logOdds, scaled('power', 3));
    expectVector(compileKnobPart(part('power', 'batter', -7), SCENE, 's')[0].logOdds, scaled('power', -3));
    expectVector(compileKnobPart(part('power', 'batter', 2.4), SCENE, 's')[0].logOdds, scaled('power', 2));
    expectVector(compileKnobPart(part('power', 'batter', -1.6), SCENE, 's')[0].logOdds, scaled('power', -2));
  });

  it.each([
    ['알 수 없는 손잡이', part('telekinesis' as KnobId, 'everyone', 2)],
    ['Object 프로토타입 속성 이름', part('toString' as KnobId, 'everyone', 2)],
    ['타자 손잡이에 투수 대상', part('contact', 'pitcher', 2)],
    ['투수 손잡이에 공격팀 대상', part('stuff', 'battingTeam', 2)],
    ['수비 손잡이에 투수 대상', part('defense', 'pitcher', 2)],
    ['환경 손잡이에 타자 대상', part('carry', 'batter', 2)],
    ['팀 손잡이에 모두 대상', part('mood', 'everyone', 2)],
    ['알 수 없는 대상', part('power', 'umpire' as Subject, 2)],
    ['세기 NaN', part('power', 'batter', Number.NaN)],
    ['세기 Infinity', part('power', 'batter', Number.POSITIVE_INFINITY)],
    ['세기가 숫자가 아님', part('power', 'batter', 'lots' as unknown as number)],
    ['세기 0', part('power', 'batter', 0)],
    ['반올림하면 0', part('power', 'batter', 0.4)],
    ['반올림하면 0 (음수)', part('power', 'batter', -0.4)],
  ])('잘못된 입력은 []: %s', (_label, input) => {
    expect(compileKnobPart(input, SCENE, 'bad')).toEqual([]);
  });
});

describe('appliesTo', () => {
  it('효과 대상이 이 타석(타자·투수·공격 진영)에 해당하는지 판정한다', () => {
    const ctx = pa('h6', 'ap', 'home');
    expect(appliesTo({ on: 'all' }, ctx)).toBe(true);
    expect(appliesTo({ on: 'batter', id: 'h6' }, ctx)).toBe(true);
    expect(appliesTo({ on: 'batter', id: 'h7' }, ctx)).toBe(false);
    expect(appliesTo({ on: 'pitcher', id: 'ap' }, ctx)).toBe(true);
    expect(appliesTo({ on: 'pitcher', id: 'HT-pen' }, ctx)).toBe(false);
    expect(appliesTo({ on: 'batting', side: 'home' }, ctx)).toBe(true);
    expect(appliesTo({ on: 'batting', side: 'away' }, ctx)).toBe(false);
    expect(appliesTo({ on: 'fielding', side: 'away' }, ctx)).toBe(true);
    expect(appliesTo({ on: 'fielding', side: 'home' }, ctx)).toBe(false);
  });
});

describe('effectMultipliers', () => {
  it('효과가 없거나 해당하는 효과가 없으면 전부 1', () => {
    const ctx = pa('h6', 'ap', 'home', true);
    expect(Array.from(effectMultipliers([], ctx, 'real'))).toEqual(ONES);
    expect(Array.from(effectMultipliers([], ctx, 'toon'))).toEqual(ONES);
    const other = compileKnobPart(part('power', 'batter', 3), AWAY_SCENE, 's');
    expect(Array.from(effectMultipliers(other, ctx, 'toon'))).toEqual(ONES);
  });

  it('타자 손잡이는 그 타자에게만 적용된다', () => {
    const effects = compileKnobPart(part('power', 'batter', 3), SCENE, 's');
    const own = effectMultipliers(effects, pa('h6', 'ap', 'home'), 'real');
    expectVector(own, expOf(scaled('power', 3)));
    expect(own[EV.HR]).toBeGreaterThan(1);
    expect(effectMultipliers(effects, pa('h6', 'HT-pen', 'home'), 'real')[EV.HR]).toBeGreaterThan(1);
    expect(Array.from(effectMultipliers(effects, pa('h7', 'ap', 'home'), 'real'))).toEqual(ONES);
  });

  it('공격팀 손잡이는 그 진영이 공격할 때만, 수비팀 손잡이는 그 진영이 수비할 때만 적용된다', () => {
    const contact = compileKnobPart(part('contact', 'battingTeam', 2), SCENE, 's');
    expect(effectMultipliers(contact, pa('h1', 'HT-pen', 'home'), 'real')[EV.K]).toBeLessThan(1);
    expect(Array.from(effectMultipliers(contact, pa('a1', 'LT-pen', 'away'), 'real'))).toEqual(ONES);

    const control = compileKnobPart(part('control', 'fieldingTeam', -2), SCENE, 's');
    expect(effectMultipliers(control, pa('h1', 'HT-pen', 'home'), 'real')[EV.BB]).toBeGreaterThan(1);
    expect(Array.from(effectMultipliers(control, pa('a1', 'LT-pen', 'away'), 'real'))).toEqual(ONES);
  });

  it('환경 손잡이는 양 팀 모든 타석에 적용된다', () => {
    const wind = compileKnobPart(part('carry', 'everyone', 2), SCENE, 's');
    for (const ctx of [pa('h1', 'HT-pen', 'home'), pa('a1', 'LT-pen', 'away'), pa('a9', 'hp', 'away', true)]) {
      expect(effectMultipliers(wind, ctx, 'real')[EV.HR]).toBeGreaterThan(1);
    }
  });

  it('mood는 대상 팀이 공격할 때 +, 수비할 때 −', () => {
    const mood = compileKnobPart(part('mood', 'battingTeam', 3), SCENE, 's');
    const batting = effectMultipliers(mood, pa('h2', 'HT-pen', 'home'), 'real');
    const fielding = effectMultipliers(mood, pa('a2', 'LT-pen', 'away'), 'real');
    expectVector(batting, expOf(scaled('mood', 3)));
    expectVector(fielding, expOf(scaled('mood', -3)));
    expect(batting[EV.K]).toBeLessThan(1);
    expect(batting[EV.HR]).toBeGreaterThan(1);
    expect(fielding[EV.K]).toBeGreaterThan(1);
    expect(fielding[EV.HR]).toBeLessThan(1);
  });

  it("scope: 'pa' 효과는 first일 때만 적용된다", () => {
    const effects = compileKnobPart(part('stuff', 'pitcher', -2, 'pa'), SCENE, 's');
    expect(effectMultipliers(effects, pa('h6', 'ap', 'home', true), 'real')[EV.K]).toBeLessThan(1);
    expect(Array.from(effectMultipliers(effects, pa('h6', 'ap', 'home', false), 'real'))).toEqual(ONES);
  });

  it('적용되는 효과의 로그 오즈를 더한다', () => {
    const effects = [
      ...compileKnobPart(part('contact', 'batter', 1), SCENE, 'a'),
      ...compileKnobPart(part('eye', 'everyone', 1), SCENE, 'b'),
    ];
    const m = effectMultipliers(effects, pa('h6', 'ap', 'home'), 'real');
    const log = scaled('contact', 1).map((x, i) => x + scaled('eye', 1)[i]);
    expectVector(m, expOf(log));
  });

  it('현실 모드는 합친 로그 오즈를 ±0.45에서 자른다', () => {
    const ctx = pa('a1', 'hp', 'away');
    const up = Array.from({ length: 20 }, () => compileKnobPart(part('power', 'everyone', 3), SCENE, 's')).flat();
    near(effectMultipliers(up, ctx, 'real')[EV.HR], Math.exp(0.45), 1e-12, 'HR 상한');
    const down = Array.from({ length: 3 }, () => compileKnobPart(part('contact', 'everyone', 3), SCENE, 's')).flat();
    near(effectMultipliers(down, ctx, 'real')[EV.K], Math.exp(-0.45), 1e-12, 'K 하한');
  });

  it('만화 모드는 로그 오즈를 6배 키우고 ±1.6에서 자른다', () => {
    const ctx = pa('h6', 'ap', 'home');
    const one = compileKnobPart(part('contact', 'batter', 1), SCENE, 's');
    near(effectMultipliers(one, ctx, 'real')[EV.K], Math.exp(-0.06), 1e-12, '현실');
    near(effectMultipliers(one, ctx, 'toon')[EV.K], Math.exp(-0.36), 1e-12, '만화');

    const three = compileKnobPart(part('contact', 'batter', 3), SCENE, 's');
    near(effectMultipliers(three, ctx, 'real')[EV.K], Math.exp(-0.18), 1e-12, '현실 3');
    near(effectMultipliers(three, ctx, 'toon')[EV.K], Math.exp(-1.08), 1e-12, '만화 3은 현실 상한을 넘을 수 있다');

    const pile = Array.from({ length: 20 }, () => compileKnobPart(part('power', 'everyone', 3), SCENE, 's')).flat();
    near(effectMultipliers(pile, ctx, 'toon')[EV.HR], Math.exp(1.6), 1e-12, '만화 상한');
    const down = Array.from({ length: 3 }, () => compileKnobPart(part('contact', 'everyone', 3), SCENE, 's')).flat();
    near(effectMultipliers(down, ctx, 'toon')[EV.K], Math.exp(-1.6), 1e-12, '만화 하한');
  });
});
