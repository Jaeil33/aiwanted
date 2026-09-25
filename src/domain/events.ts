import type { PitchCode } from '../types/domain';

/** 사건 벡터 인덱스: [K, BB(+HBP), HR, 3B, 2B, 1B, OUT(인플레이 아웃)] */
export const EV = { K: 0, BB: 1, HR: 2, T3: 3, D2: 4, S1: 5, OUT: 6 } as const;

/** EV 순서의 사건 이름 */
export const EVENT_LABEL: readonly string[] = ['삼진', '볼넷', '홈런', '3루타', '2루타', '안타', '범타'];

/** 인덱스가 PitchRow code(0 B·1 T·2 S·3 F·4 X)와 같다 */
export const PITCH_CODES: readonly PitchCode[] = ['B', 'T', 'S', 'F', 'X'];

export const PITCH_CODE_LABEL: Record<PitchCode, string> = {
  B: '볼',
  T: '스트라이크',
  S: '헛스윙',
  F: '파울',
  X: '타격',
};

/** PitchRow type 인덱스의 구종 이름 (pipeline contract.PITCH_TYPES와 같다) */
export const PITCH_TYPES: readonly string[] = ['직구', '투심', '커터', '슬라이더', '스위퍼', '커브', '체인지업', '포크', '기타'];

/** 중계 pitchResult → PitchRow code (pipeline contract.PITCH_RESULT_CODE와 같다) */
export const PITCH_RESULT_CODE: Record<string, number> = { B: 0, T: 1, S: 2, V: 2, F: 3, W: 3, H: 4 };
