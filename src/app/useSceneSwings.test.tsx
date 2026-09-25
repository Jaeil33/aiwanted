import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { Evaluation } from '../engine';
import { buildSceneSetup } from '../game/scene';
import { pitcherFor } from '../game/situation';
import { expectedSwing } from '../game/selectors';
import { createLocalEngineClient, type EngineClient, type EvaluateRequest } from '../game/engineClient';
import { fixtureAppData } from '../test/fixtures/appData';
import { fakePlatform } from '../test/gameHarness';
import type { AppData, SceneRecord } from '../types/data';
import { GameProvider } from './GameProvider';
import { gameSpecFor } from './useSceneEvaluations';
import { useSceneSwings } from './useSceneSwings';

const SLOW = { timeout: 30_000 };
const A = fixtureAppData.scenes[0];
const B: SceneRecord = { ...A, id: 'scene-b', date: '2026-08-25' };
const DATA: AppData = { ...fixtureAppData, scenes: [A, B] };

/** 지금 홈 승리 now, 어떤 사건 뒤든 홈 승리 after, 이번 타석은 삼진뿐 → 승부처 지수 = 100 × |after − now| */
function fakeEvaluation(now: number, after: number): Evaluation {
  return {
    batSide: 'home',
    pa: Float64Array.from([1, 0, 0, 0, 0, 0, 0]),
    batterWin: 0.3,
    pitcherWin: 0.7,
    inningScore: 0.3,
    expRuns: 0.5,
    winHome: now,
    tie: 0,
    winAway: 1 - now,
    after: Array.from({ length: 7 }, () => ({ winHome: after, tie: 0, winAway: 1 - after, inningScore: 0.3 })),
    count: null,
  };
}

interface Pending {
  req: EvaluateRequest;
  resolve(ev: Evaluation): void;
  reject(error: unknown): void;
}

/** 요청을 붙잡아 두는 가짜 엔진: 동시에 몇 개가 떠 있는지 센다 */
function heldEngine() {
  const calls: Pending[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const client: EngineClient = {
    evaluate: (req) =>
      new Promise<Evaluation>((resolve, reject) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const done = () => {
          inFlight -= 1;
        };
        calls.push({
          req,
          resolve: (ev) => {
            done();
            resolve(ev);
          },
          reject: (error) => {
            done();
            reject(error);
          },
        });
      }),
    playout: () => Promise.reject(new Error('not used')),
    dispose: () => undefined,
  };
  return { client, calls, maxInFlight: () => maxInFlight };
}

function wrapperFor(data: AppData, client: EngineClient) {
  const platform = fakePlatform({ createEngineClient: () => client });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GameProvider data={data} platform={platform}>
        {children}
      </GameProvider>
    );
  };
}

describe('useSceneSwings', () => {
  it('장면마다 시작 상태를 TMI 없음·현실 모드로 한 번씩, 하나씩 차례로 평가해 기대 승부처 지수를 낸다', async () => {
    const engine = heldEngine();
    const { result } = renderHook(() => useSceneSwings(DATA.scenes), { wrapper: wrapperFor(DATA, engine.client) });
    expect(result.current.pending).toBe(true);
    expect(result.current.swings).toEqual({});

    await waitFor(() => expect(engine.calls).toHaveLength(1));
    const setup = buildSceneSetup(DATA, A.id);
    expect(engine.calls[0].req).toEqual({ spec: gameSpecFor(setup, [], 'real'), state: A.state, pitcher: pitcherFor(setup, A.state), first: true });

    await act(async () => {
      engine.calls[0].resolve(fakeEvaluation(0.6, 0.4));
    });
    await waitFor(() => expect(engine.calls).toHaveLength(2));
    expect(result.current.swings[A.id]).toBeCloseTo(20, 6);
    expect(result.current.pending).toBe(true);

    await act(async () => {
      engine.calls[1].resolve(fakeEvaluation(0.5, 0.55));
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.swings[B.id]).toBeCloseTo(5, 6);
    expect(engine.maxInFlight()).toBe(1);
  });

  it('평가가 실패한 장면은 null로 두고 다음 장면으로 넘어간다', async () => {
    const engine = heldEngine();
    const { result } = renderHook(() => useSceneSwings(DATA.scenes), { wrapper: wrapperFor(DATA, engine.client) });
    await waitFor(() => expect(engine.calls).toHaveLength(1));
    await act(async () => {
      engine.calls[0].reject(new Error('boom'));
    });
    await waitFor(() => expect(engine.calls).toHaveLength(2));
    await act(async () => {
      engine.calls[1].resolve(fakeEvaluation(0.6, 0.4));
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.swings).toEqual({ [A.id]: null, [B.id]: expect.closeTo(20, 6) });
  });

  it('언마운트되면 남은 장면을 더 요청하지 않는다', async () => {
    const engine = heldEngine();
    const { unmount } = renderHook(() => useSceneSwings(DATA.scenes), { wrapper: wrapperFor(DATA, engine.client) });
    await waitFor(() => expect(engine.calls).toHaveLength(1));
    unmount();
    await act(async () => {
      engine.calls[0].resolve(fakeEvaluation(0.6, 0.4));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(engine.calls).toHaveLength(1);
  });

  it('장면이 없으면 요청하지 않고 기다리지도 않는다', () => {
    const engine = heldEngine();
    const { result } = renderHook(() => useSceneSwings([]), { wrapper: wrapperFor(DATA, engine.client) });
    expect(result.current).toEqual({ swings: {}, pending: false });
    expect(engine.calls).toHaveLength(0);
  });

  it('실제 엔진: 픽스처 장면의 값은 같은 요청의 expectedSwing과 같다', SLOW, async () => {
    const data: AppData = { ...fixtureAppData, scenes: [A] };
    const { result } = renderHook(() => useSceneSwings(data.scenes), { wrapper: wrapperFor(data, createLocalEngineClient()) });
    await waitFor(() => expect(result.current.pending).toBe(false), SLOW);
    const setup = buildSceneSetup(data, A.id);
    const ev = await createLocalEngineClient().evaluate({ spec: gameSpecFor(setup, [], 'real'), state: A.state, pitcher: pitcherFor(setup, A.state), first: true });
    const expected = expectedSwing(ev);
    expect(expected).not.toBeNull();
    expect(result.current.swings[A.id]).toBeCloseTo(expected ?? Number.NaN, 9);
    expect(result.current.swings[A.id]).toBeGreaterThan(0);
  });
});
