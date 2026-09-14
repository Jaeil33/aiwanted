/* 게임 층 공개 API (순수 모듈: DOM·window·fetch·타이머·Math.random·Date를 쓰지 않는다) */
export { batterFor, batterStanceFor, buildSceneSetup, pitcherFor } from './scene';
export type { Hands, SceneSetup } from './scene';
export { compileSessionEffects, effectsKey, measuredAvailable } from './effects';
export { battingWin, butterflyPp, entryChips, selectTiers } from './selectors';
export type { EntryChip, GaugeLike, TierView } from './selectors';
export { decodeShare, encodeShare } from './share';
export type { SharePayload } from './share';
export { canEditTmi, initialSession, sessionReducer } from './session';
export type { LiveState, PlayLogEntry, Screen, SessionAction, SessionState } from './session';
