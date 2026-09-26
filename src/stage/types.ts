import type { PitchRow } from '../types/data';
import type { Bases, PitchCode } from '../types/domain';

/*
 * 투구 연출 계약(ADR-018). 21-pitch-stage step 0에서 옛 `render/types.ts`를 여기로 줄여 옮겼다.
 * 남긴 것은 **트래커가 실제로 읽는 것뿐**이다 — 사람·타구·주루를 그리던 필드는 그 렌더러와 함께 지웠다.
 */

export type BannerTone = 'normal' | 'big';

/** 경기장 가운데 결과 배너 */
export interface StageBanner {
  text: string;
  sub?: string;
  tone?: BannerTone;
}

/** 공 하나의 연출 명령 */
export interface PitchPlayback {
  /** null이면 DEFAULT_PITCH_ROW */
  row: PitchRow | null;
  code: PitchCode;
  /** 이번 타석 몇 번째 공 */
  number: number;
  /** 슬로모션 없이 1배속 */
  fast?: boolean;
  banner?: StageBanner;
  onRelease?: () => void;
}

export interface StageInspect {
  busy: boolean;
  bases: Bases;
  markers: number;
}

/** 화면이 트래커에게 시킬 수 있는 것 */
export interface StageController {
  setBases(bases: Bases): void;
  playPitch(p: PitchPlayback): Promise<void>;
  showBanner(b: StageBanner): Promise<void>;
  clearMarkers(): void;
  resize(cssWidth: number, dpr?: number): void;
  inspect(): StageInspect;
  destroy(): void;
}
