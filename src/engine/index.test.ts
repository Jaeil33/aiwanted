import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import * as engine from './index';

/** 엔진 공개 API: step 0 타석 계층 + step 1 볼카운트 + step 2 반이닝·경기 */
const PUBLIC_API = [
  // rng
  'createRng',
  // matchup
  'matchup',
  'batterWin',
  // knobs
  'STEP',
  'KNOB_WEIGHTS',
  // effects
  'REAL_LOG_CAP',
  'TOON_FACTOR',
  'TOON_LOG_CAP',
  'fieldSideOf',
  'compileKnobPart',
  'appliesTo',
  'effectMultipliers',
  // transitions
  'transitions',
  'sampleEvent',
  'sampleInPlay',
  'sampleTransition',
  // count
  'countChain',
  'calibrateCount',
  'outcomeAtCount',
  'simulatePA',
  'nextCount',
  // halfInning
  'RMAX',
  'halfInning',
  'halfSummary',
  // game
  'MAX_INN',
  'DMAX',
  'createGame',
  'gaugesAtCount',
  'applyTransition',
  'startNextHalf',
];

describe('engine 공개 API', () => {
  it('공개 함수·상수 이름을 모두 내보내고 그 밖의 이름은 없다', () => {
    expect(Object.keys(engine).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('공개 타입 PaContext로 타석 배수를 계산할 수 있다', () => {
    const ctx: engine.PaContext = { batterId: 'h6', pitcherId: 'ap', batSide: 'home', first: true };
    expect(Array.from(engine.effectMultipliers([], ctx, 'real'))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('공개 타입 CountModel로 카운트 모델을 받는다', () => {
    const cm: engine.CountModel = engine.countChain(fixtureAppData.core.countTable, 1, 1, 1);
    expect(cm.term).toHaveLength(12);
    expect(Math.abs(cm.term[0].reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
  });

  it('공개 타입 GameConfig·TeamConfig·LineupSlot·Game·EvaluateOptions·Evaluation·AfterEvent로 경기를 평가한다', { timeout: 60_000 }, () => {
    const ones = [1, 1, 1, 1, 1, 1, 1];
    const team = (prefix: string): engine.TeamConfig => ({
      lineup: Array.from({ length: 9 }, (_, i): engine.LineupSlot => ({ id: `${prefix}${i + 1}`, rel: ones })),
      bullpen: { id: `${prefix}-pen`, rel: ones },
    });
    const cfg: engine.GameConfig = {
      lg: fixtureAppData.core.league,
      away: team('a'),
      home: team('h'),
      effects: [],
      mode: 'real',
      countTable: null,
    };
    const game: engine.Game = engine.createGame(cfg);
    const opts: engine.EvaluateOptions = { detail: false };
    const state = { inning: 9, half: 0 as const, outs: 0, bases: 0, away: 0, home: 5, slotAway: 0, slotHome: 0 };
    const ev: engine.Evaluation = game.evaluate(state, team('h').bullpen, opts);
    const after: engine.AfterEvent[] = ev.after;
    expect(after).toEqual([]);
    expect(ev.winHome).toBeGreaterThan(0.97);
  });
});
