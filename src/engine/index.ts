/* 확률 엔진 공개 API (순수 모듈: DOM·window·fetch·타이머·Math.random·Date를 쓰지 않는다) */
export { createRng } from './rng';
export { batterWin, matchup } from './matchup';
export { KNOB_WEIGHTS, STEP } from './knobs';
export {
  REAL_LOG_CAP,
  TOON_FACTOR,
  TOON_LOG_CAP,
  appliesTo,
  compileKnobPart,
  effectMultipliers,
  fieldSideOf,
} from './effects';
export type { PaContext } from './effects';
export { sampleEvent, sampleInPlay, sampleTransition, transitions } from './transitions';
export { calibrateCount, countChain, nextCount, outcomeAtCount, simulatePA } from './count';
export type { CountModel } from './count';
