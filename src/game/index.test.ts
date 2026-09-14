import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import * as game from './index';

/** game 공개 API 전체 목록 (값만. 타입은 아래 테스트가 컴파일 때 확인한다) */
const PUBLIC_API = [
  // scene
  'buildSceneSetup',
  'batterStanceFor',
  'pitcherFor',
  'batterFor',
  // effects
  'measuredAvailable',
  'compileSessionEffects',
  'effectsKey',
  // selectors
  'battingWin',
  'selectTiers',
  'butterflyPp',
  'entryChips',
  // share
  'encodeShare',
  'decodeShare',
  // session
  'initialSession',
  'canEditTmi',
  'sessionReducer',
];

describe('game 공개 API', () => {
  it('공개 함수·상수 이름을 모두 내보내고 그 밖의 이름은 없다', () => {
    expect(Object.keys(game).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('공개 타입으로 장면을 열고 확률판·칩·공유 값을 만든다', () => {
    const setup: game.SceneSetup = game.buildSceneSetup(fixtureAppData, fixtureAppData.scenes[0].id);
    const gauge: game.GaugeLike = { batterWin: 0.3, inningScore: 0.4, winHome: 0.5, tie: 0.05, winAway: 0.45 };
    const tiers: game.TierView[] = game.selectTiers(setup, setup.scene.state, gauge, gauge);
    expect(tiers).toHaveLength(3);

    const action: game.SessionAction = { type: 'openScene', sceneId: setup.scene.id, startState: setup.scene.state, seed: 5 };
    const session: game.SessionState = game.sessionReducer(game.initialSession, action);
    const screen: game.Screen = session.screen;
    const live: game.LiveState | null = session.live;
    const log: game.PlayLogEntry[] = session.log;
    expect([screen, live?.paIndex, log.length]).toEqual(['play', 0, 0]);

    const chips: game.EntryChip[] = game.entryChips({
      id: 'tmi-1',
      text: '오늘 폭염',
      interpretation: { source: 'rules', refused: true, reason: '', comment: '', parts: [] },
    });
    expect(chips).toEqual([{ label: '계산 거부', tone: 'refused' }]);

    const payload: game.SharePayload = { sceneId: setup.scene.id, texts: ['오늘 폭염'], mode: 'toon' };
    expect(game.decodeShare(game.encodeShare(payload))).toEqual(payload);
  });
});
