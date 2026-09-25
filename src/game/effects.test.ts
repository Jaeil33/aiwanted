import { describe, expect, it } from 'vitest';
import { compileEffects } from '../engine';
import { fixtureAppData, fixtureSetup } from '../test/fixtures/appData';
import type { EvidenceData } from '../types/data';
import type { EffectPart, EngineEffect, KnobPart, MeasuredPart, TmiEntry } from '../types/domain';
import { compileSessionEffects, effectsKey, measuredAvailable } from './effects';

const setup = fixtureSetup();
const EVIDENCE = fixtureAppData.evidence as EvidenceData;

function entry(id: string, parts: EffectPart[], refused = false): TmiEntry {
  return {
    id,
    text: `${id} 문장`,
    interpretation: { source: 'rules', refused, reason: refused ? '민감한 내용' : '', comment: '', parts },
  };
}

const STAMINA_PART: KnobPart = {
  kind: 'knob',
  knob: 'stamina',
  subject: 'pitcher',
  strength: -1,
  scope: 'game',
  evidence: 'fun',
  why: '짜장면 곱빼기',
};
const HEAT_PART: MeasuredPart = { kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '폭염' };
const FOCUS_PART: KnobPart = {
  kind: 'knob',
  knob: 'focus',
  subject: 'batter',
  strength: 2,
  scope: 'pa',
  evidence: 'plausible',
  why: '더위에 집중',
};

const STAMINA = entry('tmi-1', [STAMINA_PART]);
const HEAT = entry('tmi-2', [HEAT_PART, FOCUS_PART]);
const REFUSED = entry(
  'tmi-3',
  [{ kind: 'knob', knob: 'mood', subject: 'battingTeam', strength: 3, scope: 'game', evidence: 'fun', why: '거부' }],
  true,
);

describe('measuredAvailable', () => {
  it('evidence에 연결할 수 있는 실측 항목이 있을 때만 true', () => {
    expect(measuredAvailable(null)).toBe(false);
    expect(measuredAvailable(EVIDENCE)).toBe(true);
    expect(measuredAvailable({ ...EVIDENCE, items: [] })).toBe(false);
  });

  it('applicable이 아닌 변수(home)나 beta가 유한수가 아닌 항목만 있으면 false', () => {
    expect(measuredAvailable({ ...EVIDENCE, items: [{ ...EVIDENCE.items[0], id: 'home' }] })).toBe(false);
    expect(measuredAvailable({ ...EVIDENCE, items: [{ ...EVIDENCE.items[0], beta: Number.NaN }] })).toBe(false);
  });
});

describe('compileSessionEffects', () => {
  it('거부된 해석은 건너뛰고 entry마다 compileEffects 결과를 순서대로 이어 붙인다', () => {
    const effects = compileSessionEffects([STAMINA, REFUSED, HEAT], setup, EVIDENCE);
    const opts = (sourceId: string) => ({ sourceId, evidence: EVIDENCE, lg: setup.lg });
    expect(effects).toEqual([
      ...compileEffects(STAMINA.interpretation.parts, setup.sceneContext, opts('tmi-1')),
      ...compileEffects(HEAT.interpretation.parts, setup.sceneContext, opts('tmi-2')),
    ]);
    expect(effects.map((fx) => fx.sourceId)).toEqual(['tmi-1', 'tmi-2', 'tmi-2']);
  });

  it('손잡이는 장면 타자·투수에, 실측 기온은 모든 타석에 경기 내내 붙는다', () => {
    const [stamina, heat, focus] = compileSessionEffects([STAMINA, HEAT], setup, EVIDENCE);
    expect(stamina).toMatchObject({ applies: { on: 'pitcher', id: 'ap' }, scope: 'game' });
    expect(heat).toMatchObject({ applies: { on: 'all' }, scope: 'game' });
    expect(heat.logOdds.some((x) => x !== 0)).toBe(true);
    expect(focus).toMatchObject({ applies: { on: 'batter', id: 'h6' }, scope: 'pa' });
  });

  it('evidence가 없으면 실측 조각은 효과가 없고, entry가 없으면 빈 배열', () => {
    expect(compileSessionEffects([HEAT], setup, null).map((fx) => fx.applies)).toEqual([{ on: 'batter', id: 'h6' }]);
    expect(compileSessionEffects([], setup, EVIDENCE)).toEqual([]);
  });
});

describe('effectsKey', () => {
  const effects = compileSessionEffects([STAMINA, HEAT], setup, EVIDENCE);

  it('같은 입력이면 같은 키 (깊은 복사본·속성 순서가 달라도)', () => {
    const copy = JSON.parse(JSON.stringify(effects)) as EngineEffect[];
    expect(effectsKey(copy, 'real')).toBe(effectsKey(effects, 'real'));
    expect(effectsKey(compileSessionEffects([STAMINA, HEAT], setup, EVIDENCE), 'toon')).toBe(effectsKey(effects, 'toon'));

    const logOdds = effects[0].logOdds;
    const a: EngineEffect = { applies: { on: 'pitcher', id: 'ap' }, logOdds, scope: 'game', sourceId: 'x' };
    const b: EngineEffect = { sourceId: 'x', scope: 'game', logOdds: [...logOdds], applies: { id: 'ap', on: 'pitcher' } };
    expect(effectsKey([b], 'real')).toBe(effectsKey([a], 'real'));
  });

  it('sourceId는 계산에 쓰이지 않아 키에 넣지 않는다', () => {
    const renamed = effects.map((fx) => ({ ...fx, sourceId: `copy-${fx.sourceId}` }));
    expect(effectsKey(renamed, 'real')).toBe(effectsKey(effects, 'real'));
  });

  it('모드·세기·대상·범위·효과 수가 다르면 다른 키', () => {
    const key = effectsKey(effects, 'real');
    expect(effectsKey(effects, 'toon')).not.toBe(key);
    expect(effectsKey([], 'real')).not.toBe(effectsKey([], 'toon'));
    expect(effectsKey(effects.slice(0, 2), 'real')).not.toBe(key);

    const stronger = compileSessionEffects([entry('tmi-1', [{ ...STAMINA_PART, strength: -2 }]), HEAT], setup, EVIDENCE);
    expect(effectsKey(stronger, 'real')).not.toBe(key);

    const otherBatter = effects.map((fx): EngineEffect => (fx.applies.on === 'batter' ? { ...fx, applies: { on: 'batter', id: 'h7' } } : fx));
    expect(effectsKey(otherBatter, 'real')).not.toBe(key);

    const allGame = effects.map((fx): EngineEffect => ({ ...fx, scope: 'game' }));
    expect(effectsKey(allGame, 'real')).not.toBe(key);
  });
});
