import { describe, expect, it } from 'vitest';
import type { Evaluation } from '../engine';
import { fixtureAppData } from '../test/fixtures/appData';
import * as game from './index';
import indexSource from './index.ts?raw';

/** game 공개 API 전체 목록 (값만. 타입은 아래 테스트가 컴파일 때 확인한다) */
const PUBLIC_API = [
  // scene (장면 경로는 step 10에서 사라진다)
  'buildSceneSetup',
  // situation
  'batterStanceFor',
  'pitcherFor',
  'batterFor',
  'buildSituationSetup',
  'nameOf',
  'situationFromPa',
  'situationFromScene',
  'situationTitle',
  'throwsOf',
  // effects
  'measuredAvailable',
  'compileSessionEffects',
  'effectsKey',
  // selectors
  'battingWin',
  'selectTiers',
  'butterflyPp',
  'entryChips',
  'expectedSwing',
  // share
  'encodeShare',
  'decodeShare',
  // session
  'initialSession',
  'canEditTmi',
  'sessionReducer',
  // engineClient
  'specKey',
  'createLocalEngineClient',
  'handleEngineMessage',
  'createWorkerEngineClient',
  // playback
  'samplePitchCode',
  'resolvePitch',
  'countBucket',
  'pickPitchRow',
  'pitchRowsFor',
  'headline',
  'stageSceneFor',
  'playbackFor',
  'logEntryFor',
];

const FAKE_EVALUATION: Evaluation = {
  batSide: 'home',
  pa: new Float64Array(7),
  batterWin: 0.3,
  pitcherWin: 0.7,
  inningScore: 0.4,
  expRuns: 0.5,
  winHome: 0.6,
  tie: 0.05,
  winAway: 0.35,
  after: [],
  count: null,
};

describe('game 공개 API', () => {
  it('공개 함수·상수 이름을 모두 내보내고 그 밖의 이름은 없다', () => {
    expect(Object.keys(game).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('engine.worker는 공개 API에서 불러오지 않는다 (불러오면 self에 리스너를 단다)', () => {
    expect(indexSource).toContain("from './engineClient'");
    expect(indexSource).not.toMatch(/from '\.\/engine\.worker'/);
  });

  it('공개 타입으로 장면을 열고 확률판·칩·공유 값을 만든다', () => {
    const setup: game.SituationSetup = game.buildSceneSetup(fixtureAppData, fixtureAppData.scenes[0].id);
    const gauge: game.GaugeLike = { batterWin: 0.3, inningScore: 0.4, winHome: 0.5, tie: 0.05, winAway: 0.45 };
    const tiers: game.TierView[] = game.selectTiers(setup, setup.situation.state, gauge, gauge);
    expect(tiers).toHaveLength(3);

    const action: game.SessionAction = { type: 'openScene', sceneId: setup.situation.id, startState: setup.situation.state, seed: 5 };
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

    const payload: game.SharePayload = { sceneId: setup.situation.id, texts: ['오늘 폭염'], mode: 'toon' };
    expect(game.decodeShare(game.encodeShare(payload))).toEqual(payload);
  });

  it('공개 타입으로 엔진 요청·워커 메시지·연출 명령을 만든다', async () => {
    const setup = game.buildSceneSetup(fixtureAppData, fixtureAppData.scenes[0].id);
    const spec: game.GameSpec = {
      lg: setup.lg,
      away: setup.away,
      home: setup.home,
      countTable: setup.countTable,
      effects: [],
      mode: 'real',
    };
    const client: game.EngineClient = game.createLocalEngineClient({ createGameImpl: () => ({ evaluate: () => FAKE_EVALUATION }) });
    const req: game.EvaluateRequest = { spec, state: setup.situation.state, pitcher: game.pitcherFor(setup, setup.situation.state), first: true };
    const message: game.EngineRequestMessage = { id: 1, kind: 'evaluate', req };
    const response: game.EngineResponseMessage = await game.handleEngineMessage(client, message);
    expect(response).toEqual({ id: 1, ok: true, result: FAKE_EVALUATION });
    client.dispose();

    const worker: game.WorkerLike = { postMessage: () => undefined, addEventListener: () => undefined, terminate: () => undefined };
    const remote = game.createWorkerEngineClient(worker);
    const playoutReq: game.PlayoutRequest = { spec, start: setup.situation.state, scenePitcher: setup.scenePitcher, seed: 1 };
    const pending = remote.playout(playoutReq);
    remote.dispose();
    await expect(pending).rejects.toThrow(Error);

    const ended: game.PaEnd | null = null;
    const playback = game.playbackFor({
      setup,
      data: fixtureAppData,
      state: setup.situation.state,
      code: 'B',
      balls: 0,
      strikes: 0,
      number: 1,
      ended,
      over: null,
      fast: false,
      r: () => 0,
    });
    expect(playback).toMatchObject({ code: 'B', number: 1, bats: 'L', play: null });
  });
});
