/*
 * 게임 층 공개 API (순수 모듈: DOM·window·fetch·타이머·Math.random·Date를 쓰지 않는다).
 * engine.worker.ts는 불러오는 순간 self에 리스너를 달기 때문에 여기서 내보내지 않는다.
 */
export { buildSceneSetup } from './scene';
export {
  batterFor,
  batterStanceFor,
  buildSituationSetup,
  nameOf,
  pitcherFor,
  situationFromPa,
  situationFromScene,
  situationTitle,
  throwsOf,
} from './situation';
export type { Hands, SituationExtra, SituationSetup } from './situation';
/** 옛 이름. 장면 경로가 사라질 때 함께 없앤다(19-season step 10) */
export type { SituationSetup as SceneSetup } from './situation';
export { compileSessionEffects, effectsKey, measuredAvailable } from './effects';
export { gameRowsOf, pitcherPlanOf } from './pitchers';
export { gamesByDate, gamesOfTeam, halfBlocks, paList } from './paList';
export type { DateGroup, HalfBlock, PaListOptions, PaListRow } from './paList';
export { battingWin, butterflyPp, entryChips, expectedSwing, selectTiers } from './selectors';
export type { EntryChip, GaugeLike, TierView } from './selectors';
export { decodeShare, encodeShare } from './share';
export type { SharePayload } from './share';
export { canEditTmi, initialSession, sessionReducer } from './session';
export type { LiveState, PlayLogEntry, Screen, SessionAction, SessionState } from './session';
export { createLocalEngineClient, createWorkerEngineClient, handleEngineMessage, specKey } from './engineClient';
export type {
  EngineClient,
  EngineRequestMessage,
  EngineResponseMessage,
  EvaluateRequest,
  GameSpec,
  PlayoutRequest,
  WorkerLike,
} from './engineClient';
export {
  MIN_GAME_ROWS,
  countBucket,
  headline,
  logEntryFor,
  pickPitchRow,
  pitchRowsFor,
  playbackFor,
  resolvePitch,
  samplePitchCode,
  stageSceneFor,
} from './playback';
export type { PaEnd } from './playback';
