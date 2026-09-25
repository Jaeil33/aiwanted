/*
 * 게임 층 공개 API (순수 모듈: DOM·window·fetch·타이머·Math.random·Date를 쓰지 않는다).
 * engine.worker.ts는 불러오는 순간 self에 리스너를 달기 때문에 여기서 내보내지 않는다.
 */
export {
  batterFor,
  batterStanceFor,
  buildSituationSetup,
  currentSituation,
  nameOf,
  pitcherFor,
  situationFromPa,
  situationTitle,
  throwsOf,
} from './situation';
export type { Hands, SituationExtra, SituationSetup } from './situation';
export { compileSessionEffects, effectsKey, measuredAvailable } from './effects';
export { gameRowsOf, pitcherPlanOf } from './pitchers';
export { addDays, calendarWeeks, finishedGames, monthOf, monthRange, recentFinished, resultOf, scoreText, shiftMonth, teamScore } from './season';
export type { CalendarCell, GameResult, TeamScore } from './season';
export { gamesByDate, gamesOfTeam, halfBlocks, paList } from './paList';
export type { DateGroup, HalfBlock, PaListOptions, PaListRow } from './paList';
export { battingWin, butterflyPp, entryChips, expectedSwing, selectTiers } from './selectors';
export type { EntryChip, GaugeLike, TierView } from './selectors';
export { decodeShare, encodeShare } from './share';
export type { SharePayload } from './share';
export { canEditMode, canEditTmi, canStopHere, initialSession, sessionReducer } from './session';
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
