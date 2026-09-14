import { describe, expect, it } from 'vitest';
import * as engine from './index';

/** step 0(타석 계층)의 공개 API */
const PUBLIC_API = [
  // rng
  'createRng',
  // matchup
  'matchup',
  'batterWin',
  // knobs
  'STEP',
  'KNOB_WEIGHTS',
  // effects
  'REAL_LOG_CAP',
  'TOON_FACTOR',
  'TOON_LOG_CAP',
  'fieldSideOf',
  'compileKnobPart',
  'appliesTo',
  'effectMultipliers',
  // transitions
  'transitions',
  'sampleEvent',
  'sampleInPlay',
  'sampleTransition',
];

describe('engine 공개 API', () => {
  it('공개 함수·상수 이름을 모두 내보내고 그 밖의 이름은 없다', () => {
    expect(Object.keys(engine).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('공개 타입 PaContext로 타석 배수를 계산할 수 있다', () => {
    const ctx: engine.PaContext = { batterId: 'h6', pitcherId: 'ap', batSide: 'home', first: true };
    expect(Array.from(engine.effectMultipliers([], ctx, 'real'))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});
