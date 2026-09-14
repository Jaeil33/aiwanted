import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { gaugesAtCount, type Evaluation } from '../engine';
import { createLocalEngineClient, type EngineClient, type EvaluateRequest, type PlayLogEntry } from '../game';
import { fixtureAppData } from '../test/fixtures/appData';
import { fakePlatform } from '../test/gameHarness';
import type { TmiEntry } from '../types/domain';
import { GameProvider, useGame } from './GameProvider';
import type { Platform } from './platform';
import { gameSpecFor, useEvaluationPair, useSceneEvaluations } from './useSceneEvaluations';

/** createGame은 수백 ms가 걸린다 */
const SLOW = { timeout: 30_000 };
const SCENE = fixtureAppData.scenes[0];

const STAMINA: TmiEntry = {
  id: 'tmi-1',
  text: '원정투수가 경기 전 짜장면 곱빼기를 먹었다',
  interpretation: {
    source: 'rules',
    refused: false,
    reason: '',
    comment: '',
    parts: [{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -2, scope: 'game', evidence: 'fun', why: '' }],
  },
};

const LOG: PlayLogEntry = {
  index: 0,
  inning: 9,
  half: 1,
  batterName: '홈타자6',
  pitcherName: '원정투수',
  headline: '끝내기 만루 홈런!',
  score: { away: 4, home: 8 },
  wpHomeAfter: 1,
  highlight: false,
};

const fakeEvaluation = (batterWin: number): Evaluation => ({
  batSide: 'home',
  pa: new Float64Array(7),
  batterWin,
  pitcherWin: 1 - batterWin,
  inningScore: 0.4,
  expRuns: 0.8,
  winHome: 0.6,
  tie: 0.05,
  winAway: 0.35,
  after: [],
  count: null,
});

function wrapperFor(platform: Platform) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GameProvider data={fixtureAppData} platform={platform}>
        {children}
      </GameProvider>
    );
  };
}

function renderEvaluations(platform: Platform = fakePlatform()) {
  return renderHook(() => ({ evaluations: useSceneEvaluations(), game: useGame() }), { wrapper: wrapperFor(platform) });
}

type Rendered = ReturnType<typeof renderEvaluations>['result'];

async function openScene(result: Rendered) {
  await act(async () => {
    await result.current.game.actions.openScene(SCENE.id, null);
  });
}

function addTmi(result: Rendered, entry: TmiEntry) {
  act(() => {
    result.current.game.dispatch({ type: 'interpretStart' });
    result.current.game.dispatch({ type: 'interpretDone', entry, note: '', disableProvider: false });
  });
}

describe('useSceneEvaluations', () => {
  it('장면이 열리기 전에는 요청하지 않는다', () => {
    const local = createLocalEngineClient();
    const evaluate = vi.fn(local.evaluate);
    const { result } = renderEvaluations(fakePlatform({ createEngineClient: () => ({ ...local, evaluate }) }));
    expect(result.current.evaluations).toEqual({ base: null, tmi: null, baseGauge: null, tmiGauge: null, pending: false });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('base(효과 없음·현실)와 tmi(세션 TMI·모드)를 계산하고, 게이지는 지금 카운트의 gaugesAtCount에 기대 득점을 붙인다', SLOW, async () => {
    const { result } = renderEvaluations();
    await openScene(result);
    await waitFor(() => expect(result.current.evaluations.tmi).not.toBeNull(), { timeout: 20_000 });
    const { base, tmi, baseGauge, tmiGauge, pending } = result.current.evaluations;
    if (!base || !tmi || !baseGauge || !tmiGauge) throw new Error('평가가 없다');
    expect(pending).toBe(false);
    expect(base.batSide).toBe('home');
    expect(tmi.winHome).toBeCloseTo(base.winHome, 12);
    expect(tmiGauge.batterWin).toBeCloseTo(gaugesAtCount(tmi, 0, 0).batterWin, 12);
    expect(tmiGauge.expRuns).toBe(tmi.expRuns);
    expect(baseGauge.winHome).toBeCloseTo(gaugesAtCount(base, 0, 0).winHome, 12);

    act(() => {
      result.current.game.dispatch({ type: 'animationStart' });
      result.current.game.dispatch({ type: 'pitchApplied', code: 'B', balls: 1, strikes: 0 });
    });
    expect(result.current.evaluations.pending).toBe(false);
    expect(result.current.evaluations.tmiGauge?.batterWin).toBeCloseTo(gaugesAtCount(tmi, 1, 0).batterWin, 12);
  });

  it('TMI를 걸면 tmi만 달라지고, 만화 모드에서는 차이가 더 크다', SLOW, async () => {
    const { result } = renderEvaluations();
    await openScene(result);
    addTmi(result, STAMINA);
    await waitFor(
      () => {
        const { tmi, base, pending } = result.current.evaluations;
        expect(pending).toBe(false);
        expect(Math.abs((tmi?.winHome ?? 0) - (base?.winHome ?? 0))).toBeGreaterThan(1e-6);
      },
      { timeout: 20_000 },
    );
    const real = result.current.evaluations;
    const realGap = Math.abs((real.tmiGauge?.winHome ?? 0) - (real.baseGauge?.winHome ?? 0));

    act(() => result.current.game.actions.setMode('toon'));
    expect(result.current.evaluations.pending).toBe(true);
    await waitFor(() => expect(result.current.evaluations.pending).toBe(false), { timeout: 20_000 });
    const toon = result.current.evaluations;
    const toonGap = Math.abs((toon.tmiGauge?.winHome ?? 0) - (toon.baseGauge?.winHome ?? 0));
    expect(toon.base?.winHome).toBeCloseTo(real.base?.winHome ?? Number.NaN, 12);
    expect(toonGap).toBeGreaterThan(realGap * 2);
  });

  it('요청이 바뀐 뒤 늦게 도착한 옛 결과는 버린다', async () => {
    const calls: Array<{ req: EvaluateRequest; resolve: (ev: Evaluation) => void }> = [];
    const client: EngineClient = {
      evaluate: (req) => new Promise<Evaluation>((resolve) => calls.push({ req, resolve })),
      playout: vi.fn(),
      dispose: vi.fn(),
    };
    const { result } = renderEvaluations(fakePlatform({ createEngineClient: () => client }));
    await openScene(result);
    // 효과 없음·현실 모드면 base와 tmi가 같은 spec이라 한 번만 계산한다
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current.evaluations.pending).toBe(true);

    act(() => result.current.game.actions.setMode('toon'));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[1].req.spec.mode).toBe('real');
    expect(calls[2].req.spec.mode).toBe('toon');
    await act(async () => {
      calls[1].resolve(fakeEvaluation(0.2));
      calls[2].resolve(fakeEvaluation(0.9));
    });
    await waitFor(() => expect(result.current.evaluations.tmi?.batterWin).toBe(0.9));
    expect(result.current.evaluations.base?.batterWin).toBe(0.2);
    expect(result.current.evaluations.tmiGauge).toMatchObject({ batterWin: 0.9, expRuns: 0.8 });

    await act(async () => {
      calls[0].resolve(fakeEvaluation(0.5));
    });
    expect(result.current.evaluations.tmi?.batterWin).toBe(0.9);
    expect(result.current.evaluations.pending).toBe(false);
  });

  it('경기가 끝나면 새로 요청하지 않고 마지막 값을 유지한다', SLOW, async () => {
    const local = createLocalEngineClient();
    const evaluate = vi.fn(local.evaluate);
    const { result } = renderEvaluations(fakePlatform({ createEngineClient: () => ({ ...local, evaluate }) }));
    await openScene(result);
    await waitFor(() => expect(result.current.evaluations.tmi).not.toBeNull(), { timeout: 20_000 });
    const before = result.current.evaluations.tmi;
    const calls = evaluate.mock.calls.length;

    const walkoff = { ...SCENE.state, home: 8, bases: 0, slotHome: 6 };
    act(() => {
      result.current.game.dispatch({ type: 'paFinished', entry: LOG, state: walkoff });
      result.current.game.dispatch({ type: 'gameFinished', winner: 'home', walkoff: true, state: walkoff });
    });
    expect(result.current.game.session.status).toBe('finished');
    expect(evaluate).toHaveBeenCalledTimes(calls);
    expect(result.current.evaluations).toMatchObject({ tmi: before, pending: false });
  });
});

describe('useEvaluationPair', () => {
  it('넘긴 상태(예: 장면 시작)를 따로 계산하고, 장면이 없으면 요청하지 않는다', SLOW, async () => {
    const { result } = renderHook(
      () => {
        const game = useGame();
        return { pair: useEvaluationPair(game.setup ? game.setup.scene.state : null, true, true), game };
      },
      { wrapper: wrapperFor(fakePlatform()) },
    );
    expect(result.current.pair).toEqual({ base: null, tmi: null, pending: false });
    await act(async () => {
      await result.current.game.actions.openScene(SCENE.id, null);
    });
    await waitFor(() => expect(result.current.pair.tmi).not.toBeNull(), { timeout: 20_000 });
    const setup = result.current.game.setup;
    if (!setup) throw new Error('setup이 없다');
    expect(gameSpecFor(setup, [], 'toon')).toEqual({
      lg: setup.lg,
      away: setup.away,
      home: setup.home,
      countTable: setup.countTable,
      effects: [],
      mode: 'toon',
    });
  });
});
