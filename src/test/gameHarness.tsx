import { render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { GameProvider, useGame, type GameContextValue } from '../app/GameProvider';
import type { Platform } from '../app/platform';
import { createLocalEngineClient } from '../game';
import type { LiveApi } from '../live/providers/http';
import type { AppData } from '../types/data';
import type { GameSummary, LiveGame } from '../types/live';
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
    liveApi: null,
    createEngineClient: () => createLocalEngineClient(),
    today: () => '2026-08-15',
    ...over,
  };
}

/** 일정·경기를 그대로 돌려주는 가짜 경기 API. 진짜 네트워크를 부르지 않는다 */
export function fakeLiveApi(over: { games?: GameSummary[]; game?: LiveGame; fail?: boolean } = {}): LiveApi {
  return {
    games: async () => {
      if (over.fail) throw new Error('실패');
      return over.games ?? [];
    },
    game: async (gameId) => {
      if (over.fail || !over.game) throw new Error('실패');
      // 부른 경기 id를 그대로 돌려준다(진짜 서버처럼): 화면이 요청과 응답을 맞춰 본다
      return { ...over.game, summary: { ...over.game.summary, gameId } };
    },
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
  const tree = (children: ReactNode) => (
    <GameProvider data={opts.data ?? fixtureAppData} platform={opts.platform ?? fakePlatform()}>
      <Probe />
      {children}
    </GameProvider>
  );
  const utils = render(tree(ui));
  const game = (): GameContextValue => {
    if (!box.current) throw new Error('GameProvider 컨텍스트가 아직 없다');
    return box.current;
  };
  // 같은 Provider 안에서 다시 그린다(기본 rerender는 Provider를 벗겨 버린다)
  const rerender = (next: ReactNode) => utils.rerender(tree(next));
  return { ...utils, rerender, game };
}
