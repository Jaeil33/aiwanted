import { render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { GameProvider, useGame, type GameContextValue } from '../app/GameProvider';
import type { Platform } from '../app/platform';
import { createLocalEngineClient } from '../game';
import type { AppData } from '../types/data';
import { fixtureAppData } from './fixtures/appData';

/*
 * 테스트 전용: 픽스처 데이터와 가짜 플랫폼(지역 엔진, AI 없음)으로 GameProvider 안에 그리고,
 * 최신 컨텍스트 값을 game()으로 꺼낸다.
 */

export function fakePlatform(over: Partial<Platform> = {}): Platform {
  return {
    artifactSample: null,
    downloads: null,
    apiBase: null,
    createEngineClient: () => createLocalEngineClient(),
    today: () => '2026-08-15',
    ...over,
  };
}

export function renderWithGame(ui: ReactNode, opts: { data?: AppData; platform?: Platform } = {}) {
  const box: { current: GameContextValue | null } = { current: null };
  function Probe() {
    const value = useGame();
    useEffect(() => {
      box.current = value;
    });
    return null;
  }
  const utils = render(
    <GameProvider data={opts.data ?? fixtureAppData} platform={opts.platform ?? fakePlatform()}>
      <Probe />
      {ui}
    </GameProvider>,
  );
  const game = (): GameContextValue => {
    if (!box.current) throw new Error('GameProvider 컨텍스트가 아직 없다');
    return box.current;
  };
  return { ...utils, game };
}
