import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SampleLike } from '../ai';
import type { PlayLogEntry, SharePayload } from '../game';
import { fixtureAppData } from '../test/fixtures/appData';
import { fakePlatform, renderWithGame } from '../test/gameHarness';
import { sceneSeed, useGame } from './GameProvider';

const SCENE = fixtureAppData.scenes[0];
const HEAT = '오늘 폭염';
const JJAJANG = '원정투수가 경기 전 짜장면 곱빼기를 먹었다';

const LOG: PlayLogEntry = {
  index: 0,
  inning: 9,
  half: 1,
  batterName: '홈타자6',
  pitcherName: '원정투수',
  headline: '볼넷',
  score: { away: 4, home: 5 },
  wpHomeAfter: 1,
  highlight: false,
};

/** signal이 abort되면 {code: 'cancelled'}로 reject하고, 그 전에는 끝나지 않는 가짜 sample */
function hangingSample() {
  const signals: AbortSignal[] = [];
  const sample: SampleLike = {
    json: vi.fn(
      (_input: string, options?: Record<string, unknown>) =>
        new Promise<unknown>((_resolve, reject) => {
          const signal = options?.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener('abort', () => reject({ code: 'cancelled', message: '취소' }));
        }),
    ),
  };
  return { sample, signals };
}

async function openFixture(game: ReturnType<typeof renderWithGame>['game'], share: SharePayload | null = null) {
  await act(async () => {
    await game().actions.openScene(SCENE.id, share);
  });
}

async function submit(game: ReturnType<typeof renderWithGame>['game'], text: string) {
  await act(async () => {
    await game().actions.submitTmi(text);
  });
}

describe('useGame', () => {
  it('GameProvider 밖에서 부르면 Error', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Outside() {
      useGame();
      return null;
    }
    expect(() => render(<Outside />)).toThrow(/GameProvider/);
    quiet.mockRestore();
  });
});

describe('GameProvider', () => {
  it('처음에는 열린 장면·setup·AI가 없고 데이터·플랫폼·엔진 클라이언트가 있다', () => {
    const platform = fakePlatform();
    const { game } = renderWithGame(null, { platform });
    expect(game().session.sceneId).toBeNull();
    expect(game().setup).toBeNull();
    expect(game().provider).toBeNull();
    expect(game().data).toBe(fixtureAppData);
    expect(game().platform).toBe(platform);
    expect(game().engine.evaluate).toBeTypeOf('function');
  });

  it('getSession은 렌더를 기다리지 않고 dispatch 직후 상태를 돌려준다', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    // ref 쪽에도 같은 reducer를 적용하므로 내용은 렌더된 세션과 같다 (객체는 다를 수 있다)
    expect(game().getSession()).toEqual(game().session);
    const seen: { status?: string; rendered?: string } = {};
    act(() => {
      game().dispatch({ type: 'animationStart' });
      seen.status = game().getSession().status;
      seen.rendered = game().session.status;
    });
    expect(seen).toEqual({ status: 'animating', rendered: 'ready' });
    expect(game().session.status).toBe('animating');
  });

  it('openScene: 장면 시작 상태와 날짜·장면 id로 만든 seed로 열고 setup을 만든다', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    const { session, setup } = game();
    expect(session).toMatchObject({ screen: 'play', sceneId: SCENE.id, seed: sceneSeed('2026-08-15', SCENE.id), mode: 'real', tmis: [] });
    expect(session.live?.state).toEqual(SCENE.state);
    expect(setup?.scene).toBe(SCENE);
    expect(setup?.promptContext.situation).toBe('9회말 2사 만루');
  });

  it('openScene: 모르는 장면 id는 무시한다', async () => {
    const { game } = renderWithGame(null);
    const before = game().session;
    await act(async () => {
      await game().actions.openScene('nope', null);
    });
    expect(game().session).toBe(before);
  });

  it('submitTmi: AI가 없으면 규칙 해석 entry를 tmi-1, tmi-2 순서로 붙인다', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    await submit(game, `  ${HEAT}  `);
    expect(game().session.tmis).toHaveLength(1);
    expect(game().session.tmis[0]).toMatchObject({ id: 'tmi-1', text: HEAT, interpretation: { source: 'rules', refused: false } });
    expect(game().session.interpreting).toBe(false);
    await submit(game, JJAJANG);
    expect(game().session.tmis.map((e) => e.id)).toEqual(['tmi-1', 'tmi-2']);
  });

  it('submitTmi: 80자를 넘는 문장은 80자로 잘라 붙인다', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    await submit(game, '가'.repeat(90));
    expect(game().session.tmis[0].text).toBe('가'.repeat(80));
  });

  it('submitTmi: 빈 문장은 interpretFailed로 알림만 남긴다', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    await submit(game, '   ');
    expect(game().session).toMatchObject({ tmis: [], interpreting: false });
    expect(game().session.notice).toMatch(/비어/);
  });

  it('removeTmi·setMode·resetPlay', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    await submit(game, HEAT);
    act(() => game().actions.setMode('toon'));
    expect(game().session.mode).toBe('toon');
    act(() => game().actions.removeTmi('tmi-1'));
    expect(game().session.tmis).toEqual([]);

    const seed = game().session.seed;
    act(() => game().dispatch({ type: 'paFinished', entry: LOG, state: { ...SCENE.state, home: 5 } }));
    expect(game().session.live?.paIndex).toBe(1);
    act(() => game().actions.resetPlay());
    expect(game().session).toMatchObject({ seed: seed + 1, mode: 'toon', log: [], status: 'ready' });
    expect(game().session.live).toEqual({ state: SCENE.state, balls: 0, strikes: 0, paIndex: 0, pitches: [] });
  });

  it('편집이 잠기면 submitTmi·removeTmi·setMode를 무시하고 AI를 부르지 않는다', async () => {
    const sample: SampleLike = {
      json: vi.fn(async () => ({ refused: false, reason: '', comment: '더워서 공이 멀리 가요.', parts: [] })),
    };
    const { game } = renderWithGame(null, { platform: fakePlatform({ artifactSample: sample }) });
    expect(game().provider?.name).toBe('artifact');
    await openFixture(game);
    await submit(game, HEAT);
    expect(sample.json).toHaveBeenCalledTimes(1);
    expect(game().session.tmis).toHaveLength(1);

    act(() => game().dispatch({ type: 'animationStart' }));
    const locked = game().session;
    await submit(game, JJAJANG);
    act(() => {
      game().actions.removeTmi('tmi-1');
      game().actions.setMode('toon');
    });
    expect(game().session).toBe(locked);
    expect(sample.json).toHaveBeenCalledTimes(1);
  });

  it('TMI가 3개면 더 부르지 않는다', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    for (const text of [HEAT, JJAJANG, '관중이 떼창을 한다', '포수가 딸꾹질을 한다']) await submit(game, text);
    expect(game().session.tmis.map((e) => e.id)).toEqual(['tmi-1', 'tmi-2', 'tmi-3']);
  });

  it('judge: 판정을 저장한다 (AI 없음 → 기록표 판정)', async () => {
    const { game } = renderWithGame(null);
    await openFixture(game);
    await submit(game, HEAT);
    await act(async () => {
      await game().actions.judge('tmi-1');
    });
    expect(game().session.verdicts['tmi-1']).toMatchObject({ source: 'rules' });
    expect(game().session.judgingId).toBeNull();
  });

  it('openScene에 같은 장면의 공유 값이 있으면 모드를 정하고 TMI를 순서대로 건다', async () => {
    const { game } = renderWithGame(null);
    const share: SharePayload = { sceneId: SCENE.id, texts: [HEAT, JJAJANG], mode: 'toon' };
    await openFixture(game, share);
    expect(game().session.mode).toBe('toon');
    expect(game().session.tmis.map((e) => e.text)).toEqual([HEAT, JJAJANG]);
  });

  it('AI가 영구 오류를 내면 규칙으로 계산하고 이후 provider를 끈다', async () => {
    const sample: SampleLike = {
      json: vi.fn(async () => {
        throw { code: 'not_granted', message: '거절' };
      }),
    };
    const { game } = renderWithGame(null, { platform: fakePlatform({ artifactSample: sample }) });
    await openFixture(game);
    await submit(game, HEAT);
    expect(game().session.tmis[0].interpretation.source).toBe('rules');
    expect(game().session.providerDisabled).toBe(true);
    expect(game().session.notice).not.toBe('');
    expect(game().provider).toBeNull();
    await submit(game, JJAJANG);
    expect(sample.json).toHaveBeenCalledTimes(1);
    expect(game().session.tmis).toHaveLength(2);
  });

  it('해석을 기다리는 중에 장면을 다시 열면 요청을 취소하고 늦은 결과를 버린다', async () => {
    const { sample, signals } = hangingSample();
    const { game } = renderWithGame(null, { platform: fakePlatform({ artifactSample: sample }) });
    await openFixture(game);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = game().actions.submitTmi(HEAT);
    });
    await waitFor(() => expect(sample.json).toHaveBeenCalledTimes(1));
    expect(game().session.interpreting).toBe(true);
    await act(async () => {
      await game().actions.openScene(SCENE.id, null);
      await pending;
    });
    expect(signals[0].aborted).toBe(true);
    expect(game().session).toMatchObject({ interpreting: false, tmis: [], notice: '' });
  });

  it('언마운트하면 기다리던 AI 요청을 취소한다', async () => {
    const { sample, signals } = hangingSample();
    const { game, unmount } = renderWithGame(null, { platform: fakePlatform({ artifactSample: sample }) });
    await openFixture(game);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = game().actions.submitTmi(HEAT);
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    unmount();
    expect(signals[0].aborted).toBe(true);
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('sceneSeed', () => {
  it('같은 날짜·장면이면 같은 양의 32비트 정수, 날짜나 장면이 다르면 다른 값', () => {
    const seed = sceneSeed('2026-08-15', 'fixture-walkoff');
    expect(Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff).toBe(true);
    expect(sceneSeed('2026-08-15', 'fixture-walkoff')).toBe(seed);
    expect(sceneSeed('2026-08-16', 'fixture-walkoff')).not.toBe(seed);
    expect(sceneSeed('2026-08-15', 'other-scene')).not.toBe(seed);
  });
});
