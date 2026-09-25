import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createLocalEngineClient, type PlayLogEntry, type PlayoutRequest } from '../game';
import type { PitchPlayback, StageController } from '../stage';
import { FIXTURE_FINAL, fixtureAppData, fixtureSituation } from '../test/fixtures/appData';
import { fakePlatform } from '../test/gameHarness';
import type { GameState, TmiEntry } from '../types/domain';
import { GameProvider, useGame, type GameContextValue } from './GameProvider';
import type { Platform } from './platform';
import { usePlayback } from './usePlayback';

/** createGame·재생은 수백 ms~수 초가 걸린다 */
const SLOW = { timeout: 30_000 };
const SCENE = fixtureSituation;
const noSleep = async () => undefined;

/** 호출을 기록하는 가짜 StageController. hold면 playPitch가 release() 때까지 기다린다 */
function fakeStage(opts: { hold?: boolean } = {}) {
  const waiting: Array<() => void> = [];
  const stage = {
    setScene: vi.fn(),
    setBases: vi.fn(),
    setBoard: vi.fn(),
    playPitch: vi.fn((p: PitchPlayback) => {
      p.onRelease?.();
      return opts.hold ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve();
    }),
    showBanner: vi.fn(async () => undefined),
    clearMarkers: vi.fn(),
    resize: vi.fn(),
    inspect: vi.fn(() => ({ busy: false, bases: 0, board: ['', ''] as [string, string], banner: null, markers: 0, scene: null })),
    destroy: vi.fn(),
  };
  const controller: StageController = stage;
  return {
    stage,
    controller,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

function wrapperFor(platform: Platform) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GameProvider data={fixtureAppData} platform={platform}>
        {children}
      </GameProvider>
    );
  };
}

function renderPlayback(opts: { platform?: Platform; hold?: boolean } = {}) {
  const fake = fakeStage({ hold: opts.hold });
  const stageRef = { current: fake.controller as StageController | null };
  const hook = renderHook(() => ({ playback: usePlayback(stageRef, { sleep: noSleep }), game: useGame() }), {
    wrapper: wrapperFor(opts.platform ?? fakePlatform()),
  });
  return { ...hook, ...fake, stageRef };
}

type Rendered = ReturnType<typeof renderPlayback>['result'];

async function openScene(result: Rendered) {
  await act(async () => {
    await result.current.game.actions.openSituation(fixtureSituation, { actualFinal: { ...FIXTURE_FINAL } }, null);
  });
}

/** playout 요청을 기록하는 지역 엔진 플랫폼 */
function spyPlatform() {
  const requests: PlayoutRequest[] = [];
  const platform = fakePlatform({
    createEngineClient: () => {
      const local = createLocalEngineClient();
      return {
        evaluate: local.evaluate,
        playout: (req) => {
          requests.push(req);
          return local.playout(req);
        },
        dispose: local.dispose,
      };
    },
  });
  return { platform, requests };
}

const PA_TMI: TmiEntry = {
  id: 'tmi-1',
  text: '홈타자6이 새 배트를 들고 나왔다',
  interpretation: {
    source: 'rules',
    refused: false,
    reason: '',
    comment: '',
    parts: [
      { kind: 'knob', knob: 'focus', subject: 'batter', strength: 2, scope: 'pa', evidence: 'plausible', why: '' },
      { kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '' },
    ],
  },
};

function addTmi(result: Rendered, entry: TmiEntry) {
  act(() => {
    result.current.game.dispatch({ type: 'interpretStart' });
    result.current.game.dispatch({ type: 'interpretDone', entry, note: '', disableProvider: false });
  });
}

const replayTrace = (result: Rendered) =>
  result.current.game.session.log.map((entry) => `${entry.inning}${entry.half}|${entry.headline}|${entry.score.away}:${entry.score.home}`);

describe('usePlayback', () => {
  it('한 구 던지기: seed에서 뽑은 공 하나를 연출하고 카운트나 타석을 반영한다', SLOW, async () => {
    const { result, stage } = renderPlayback();
    await openScene(result);
    await act(async () => {
      await result.current.playback.throwPitch();
    });
    const session = result.current.game.session;
    expect(stage.playPitch).toHaveBeenCalledTimes(1);
    const playback = stage.playPitch.mock.calls[0][0];
    expect(playback).toMatchObject({ number: 1, bats: 'L', fast: false });
    expect(stage.clearMarkers).toHaveBeenCalledTimes(1);
    expect(stage.setBoard).toHaveBeenCalledWith(['홈타자6 vs 원정투수', '']);
    expect(stage.setBoard).toHaveBeenCalledWith(['홈타자6 vs 원정투수', expect.stringMatching(/^\S+ \d+km$/)]);
    expect(session.status).not.toBe('animating');
    if (session.log.length === 0) {
      expect(session.live?.pitches).toEqual([{ balls: 0, strikes: 0, code: playback.code }]);
      expect((session.live?.balls ?? 0) + (session.live?.strikes ?? 0)).toBe(1);
      expect(playback.banner).toBeUndefined();
    } else {
      expect(session.log).toHaveLength(1);
      expect(playback.banner?.text).toBe(session.log[0].headline);
    }
    expect(result.current.playback.busy).toBe(false);
  });

  it('이 타석 끝까지: 타석이 끝날 때까지 던지고(앞 공은 fast) 기록 한 줄을 남긴다', SLOW, async () => {
    const { result, stage } = renderPlayback();
    await openScene(result);
    await act(async () => {
      await result.current.playback.finishPa();
    });
    const session = result.current.game.session;
    expect(session.log).toHaveLength(1);
    expect(session.log[0]).toMatchObject({ index: 0, inning: 9, half: 1, batterName: '홈타자6', pitcherName: '원정투수', highlight: false });
    expect(typeof session.log[0].wpHomeAfter).toBe('number');
    const pitches = stage.playPitch.mock.calls.map(([p]) => p);
    expect(pitches.map((p) => p.number)).toEqual(pitches.map((_, i) => i + 1));
    expect(pitches.slice(0, -1).every((p) => p.fast)).toBe(true);
    expect(pitches.at(-1)).toMatchObject({ fast: false, banner: { text: session.log[0].headline } });
    if (session.status !== 'finished') {
      expect(session.live).toMatchObject({ paIndex: 1, balls: 0, strikes: 0, pitches: [] });
      expect(result.current.playback.trail[0]).toMatchObject({ winHome: session.log[0].wpHomeAfter });
    }
  });

  it('경기 끝까지: 승부처 타석만 연출하고 gameFinished까지 가서 결과 화면 상태가 된다', SLOW, async () => {
    const { result, stage } = renderPlayback();
    await openScene(result);
    await act(async () => {
      await result.current.playback.finishGame();
    });
    const session = result.current.game.session;
    expect(session).toMatchObject({ status: 'finished', screen: 'result' });
    expect(['home', 'away', 'tie']).toContain(session.final?.winner);
    expect(session.log.length).toBeGreaterThan(0);
    expect(session.log[0].highlight).toBe(true);
    expect(session.log.at(-1)?.highlight).toBe(true);
    expect(session.log.map((entry) => entry.index)).toEqual(session.log.map((_, i) => i));
    expect(stage.playPitch).toHaveBeenCalled();
    expect(stage.playPitch.mock.calls.at(-1)?.[0].banner?.text).toBe(session.log.at(-1)?.headline);
    expect(result.current.playback.busy).toBe(false);
  });

  it('같은 seed면 같은 경기를 다시 치른다', SLOW, async () => {
    const first = renderPlayback();
    await openScene(first.result);
    await act(async () => {
      await first.result.current.playback.finishGame();
    });
    const traceA = replayTrace(first.result);
    const codesA = first.stage.playPitch.mock.calls.map(([p]) => p.code).join('');
    first.unmount();

    const second = renderPlayback();
    await openScene(second.result);
    await act(async () => {
      await second.result.current.playback.finishGame();
    });
    expect(replayTrace(second.result)).toEqual(traceA);
    expect(second.stage.playPitch.mock.calls.map(([p]) => p.code).join('')).toBe(codesA);
  });

  it('진행 중에 다시 부르면 무시한다', SLOW, async () => {
    const { result, stage, release } = renderPlayback({ hold: true });
    await openScene(result);
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.playback.throwPitch();
    });
    await waitFor(() => expect(stage.playPitch).toHaveBeenCalledTimes(1), { timeout: 20_000 });
    expect(result.current.playback.busy).toBe(true);
    await act(async () => {
      await result.current.playback.throwPitch();
      await result.current.playback.finishPa();
      await result.current.playback.finishGame();
    });
    expect(stage.playPitch).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await running;
    });
    expect(result.current.playback.busy).toBe(false);
    expect(stage.playPitch).toHaveBeenCalledTimes(1);
  });

  it('장면 첫 타석이 끝난 뒤의 경기 끝까지는 pa 범위 효과를 spec에서 뺀다', SLOW, async () => {
    const fromStart = spyPlatform();
    const a = renderPlayback({ platform: fromStart.platform });
    await openScene(a.result);
    addTmi(a.result, PA_TMI);
    await act(async () => {
      await a.result.current.playback.finishGame();
    });
    expect(fromStart.requests).toHaveLength(1);
    expect(fromStart.requests[0].spec.effects.some((fx) => fx.scope === 'pa')).toBe(true);
    expect(fromStart.requests[0].start).toEqual(SCENE.state);
    a.unmount();

    const later = spyPlatform();
    const b = renderPlayback({ platform: later.platform });
    await openScene(b.result);
    addTmi(b.result, PA_TMI);
    const tenthTop: GameState = { ...SCENE.state, inning: 10, half: 0, outs: 0, bases: 0, slotHome: 6 };
    const entry: PlayLogEntry = {
      index: 0,
      inning: 9,
      half: 1,
      batterName: '홈타자6',
      pitcherName: '원정투수',
      headline: '뜬공 아웃',
      score: { away: 4, home: 4 },
      wpHomeAfter: 0.4,
      highlight: false,
    };
    act(() => b.result.current.game.dispatch({ type: 'paFinished', entry, state: tenthTop }));
    await act(async () => {
      await b.result.current.playback.finishGame();
    });
    expect(later.requests).toHaveLength(1);
    const req = later.requests[0];
    expect(req.spec.effects.length).toBeGreaterThan(0);
    expect(req.spec.effects.some((fx) => fx.scope === 'pa')).toBe(false);
    expect(req.start).toEqual(tenthTop);
    expect(req.scenePitcher.id).toBe('LT-pen');
    expect(b.result.current.game.session.log[1]?.index).toBe(1);
  });

  it('언마운트하면 진행 중인 반복을 멈추고, 던진 공은 마무리해 세션을 연출 중으로 남기지 않는다', SLOW, async () => {
    const fake = fakeStage({ hold: true });
    const stageRef = { current: fake.controller as StageController | null };
    const box: { game: GameContextValue | null; playback: ReturnType<typeof usePlayback> | null } = { game: null, playback: null };
    function Player() {
      const playback = usePlayback(stageRef, { sleep: noSleep });
      useEffect(() => {
        box.playback = playback;
      });
      return null;
    }
    function Harness({ show }: { show: boolean }) {
      const game = useGame();
      useEffect(() => {
        box.game = game;
      });
      return show ? <Player /> : null;
    }
    const view = render(
      <GameProvider data={fixtureAppData} platform={fakePlatform()}>
        <Harness show />
      </GameProvider>,
    );
    const game = () => {
      if (!box.game) throw new Error('컨텍스트가 없다');
      return box.game;
    };
    await act(async () => {
      await game().actions.openSituation(fixtureSituation, { actualFinal: { ...FIXTURE_FINAL } }, null);
    });
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = box.playback?.finishPa() ?? Promise.resolve();
    });
    await waitFor(() => expect(fake.stage.playPitch).toHaveBeenCalledTimes(1), { timeout: 20_000 });

    view.rerender(
      <GameProvider data={fixtureAppData} platform={fakePlatform()}>
        <Harness show={false} />
      </GameProvider>,
    );
    await act(async () => {
      fake.release();
      await running;
    });
    expect(fake.stage.playPitch).toHaveBeenCalledTimes(1);
    const session = game().getSession();
    expect(session.status).not.toBe('animating');
    expect((session.live?.pitches.length ?? 0) + session.log.length).toBe(1);
  });
});
