import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { fixtureAppData } from '../test/fixtures/appData';
import * as engine from './index';

/** 엔진 공개 API 전체 목록 */
const PUBLIC_API = [
  // 사건 인덱스 (src/domain/events 재수출)
  'EV',
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
  // measured
  'OFFENSE_W',
  'runsElasticity',
  'measuredRunsRatio',
  'compileMeasuredPart',
  'compileEffects',
  // playout
  'playout',
  'pickHighlights',
  'expectedCounts',
];

const ONES = [1, 1, 1, 1, 1, 1, 1];

const flatTeam = (prefix: string): engine.TeamConfig => ({
  lineup: Array.from({ length: 9 }, (_, i): engine.LineupSlot => ({ id: `${prefix}${i + 1}`, rel: ONES })),
  bullpen: { id: `${prefix}-pen`, rel: ONES },
});

describe('engine 공개 API', () => {
  it('공개 함수·상수 이름을 모두 내보내고 그 밖의 이름은 없다', () => {
    expect(Object.keys(engine).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('EV는 src/domain/events의 사건 인덱스 그대로다', () => {
    expect(engine.EV).toBe(EV);
  });

  it('공개 타입 PaContext로 타석 배수를 계산할 수 있다', () => {
    const ctx: engine.PaContext = { batterId: 'h6', pitcherId: 'ap', batSide: 'home', first: true };
    expect(Array.from(engine.effectMultipliers([], ctx, 'real'))).toEqual(ONES);
  });

  it('공개 타입 CountModel로 카운트 모델을 받는다', () => {
    const cm: engine.CountModel = engine.countChain(fixtureAppData.core.countTable, 1, 1, 1);
    expect(cm.term).toHaveLength(12);
    expect(Math.abs(cm.term[0].reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
  });

  it('공개 타입으로 경기를 만들어 평가하고 재생한다', { timeout: 60_000 }, () => {
    const cfg: engine.GameConfig = {
      lg: fixtureAppData.core.league,
      away: flatTeam('a'),
      home: flatTeam('h'),
      effects: [],
      mode: 'real',
      countTable: null,
    };
    const game: engine.Game = engine.createGame(cfg);
    const opts: engine.EvaluateOptions = { detail: false };
    const start = { inning: 9, half: 0 as const, outs: 0, bases: 0, away: 0, home: 5, slotAway: 0, slotHome: 0 };
    const ev: engine.Evaluation = game.evaluate(start, cfg.home.bullpen, opts);
    const after: engine.AfterEvent[] = ev.after;
    expect(after).toEqual([]);
    expect(ev.winHome).toBeGreaterThan(0.97);

    const input: engine.PlayoutInput = {
      game,
      start,
      scenePitcher: cfg.home.bullpen,
      away: cfg.away,
      home: cfg.home,
      lg: cfg.lg,
      effects: cfg.effects,
      mode: cfg.mode,
      countTable: null,
      rng: engine.createRng(1),
      trackWinProbability: false,
    };
    const result: engine.PlayoutResult = engine.playout(input);
    const pas: engine.PlayoutPA[] = result.plateAppearances;
    expect(pas.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });
});
