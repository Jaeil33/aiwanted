import type { PitchRow } from '../../types/data';
import type { Bases, PitchCode, Play, RunnerMove } from '../../types/domain';

/** 경기장에 서는 두 팀: 공격(타자)·수비(투수·야수) */
export interface StageScene {
  bat: { color: string; home: boolean; bats: 'L' | 'R' };
  fld: { color: string; home: boolean; throws: 'L' | 'R' };
  /** 스트라이크 존 위·아래(ft). 없으면 3.4 / 1.6 */
  zone?: { top: number; bottom: number };
}

export type BannerTone = 'normal' | 'big';

/** 경기장 가운데 결과 배너 */
export interface StageBanner {
  text: string;
  sub?: string;
  tone?: BannerTone;
}

/** 공 하나의 연출 명령 */
export interface PitchPlayback {
  row: PitchRow | null;          // null이면 DEFAULT_PITCH_ROW
  code: PitchCode;
  number: number;                // 이번 타석 몇 번째 공
  fast?: boolean;                // 슬로모션 없이 1배속
  play?: Play | null;            // 인플레이 결과(타구 연출)
  bats: 'L' | 'R';
  moves?: readonly RunnerMove[]; // 미니 다이아몬드 주자 이동
  basesAfter?: Bases;
  banner?: StageBanner;
  onRelease?: () => void;
}

/** 시간·프레임·오프스크린 캔버스. 테스트는 가짜를 넣는다 */
export interface StageDeps {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
  createCanvas(width: number, height: number): HTMLCanvasElement;
}

export interface StageOptions {
  /** prefers-reduced-motion: 슬로모션·잔상·불꽃·대기 동작을 끈다 */
  reducedMotion?: boolean;
  deps?: Partial<StageDeps>;
}

export interface StageInspect {
  busy: boolean;
  bases: Bases;
  board: [string, string];
  banner: string | null;
  markers: number;
  scene: StageScene | null;
}

export interface StageController {
  setScene(scene: StageScene): void;
  setBases(bases: Bases): void;
  setBoard(lines: [string, string]): void;
  playPitch(p: PitchPlayback): Promise<void>;
  showBanner(b: StageBanner): Promise<void>;
  clearMarkers(): void;
  resize(cssWidth: number, dpr?: number): void;
  inspect(): StageInspect;
  destroy(): void;
}
