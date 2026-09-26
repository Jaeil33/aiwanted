/*
 * 경기장 하늘 네 통(21-pitch-stage step 2). 순수 계산이다 — DOM도 시계도 읽지 않는다.
 *
 * **경기 시작 시각으로 한 번 고르고 이닝에 따라 바꾸지 않는다**(/grill-me Q19 a).
 * 2026 실제 일정(8/14~9/26, 169경기)의 시작 시각은 14:00 7 · 17:00 30 · 18:00 11 · 18:30 78 · 19:00 43이다.
 * 그래서 경계를 17:00과 18:30에 두면 낮 4% · 해질녘 24% · 밤 72%가 되어 세 하늘이 모두 쓰인다.
 * 경계가 17:00 하나였을 때는 낮이 4%라 나머지 96%가 전부 같은 밤 그림이었다(/grill-me Q23 b).
 *
 * 색은 지어낸 값이다(/grill-me Q6 a). 실측 근거가 있는 값이 아니다.
 */

export type SkyKind = 'day' | 'dusk' | 'night' | 'dome';

export const SKY_KINDS: readonly SkyKind[] = ['day', 'dusk', 'night', 'dome'];

/** 이 시각부터 해질녘 */
const DUSK_FROM = '17:00';
/** 이 시각부터 밤 */
const NIGHT_FROM = '18:30';

/** 경기 시작 시각("18:30")과 돔 여부로 하늘을 고른다. 시각을 모르면 밤 */
export function skyKindOf(startTime: string | null, dome: boolean): SkyKind {
  if (dome) return 'dome';
  if (!startTime) return 'night';
  if (startTime < DUSK_FROM) return 'day';
  if (startTime < NIGHT_FROM) return 'dusk';
  return 'night';
}

export interface SkyPalette {
  kind: SkyKind;
  /** 관중석 위 끝(하늘에 가까운 쪽) */
  skyTop: string;
  standsTop: string;
  standsBottom: string;
  /** 관중 점 색 후보 "r,g,b" */
  crowd: readonly string[];
  /** 관중 점 기본 투명도 */
  crowdAlpha: number;
  grassTop: string;
  grassMid: string;
  grassBottom: string;
  dirt: string;
  moundTop: string;
  /** 외야 펜스 */
  fence: string;
  /** 조명탑 번짐 세기 0~1. 낮에는 0 */
  glow: number;
  /** 조명 색 */
  light: string;
  /** 관중석 카메라 플래시가 보이나 */
  flashes: boolean;
  /** 비네트 세기 0~1 */
  vignette: number;
  /** 파울 라인·베이스 같은 흰 선의 투명도 */
  chalk: number;
}

const PALETTES: Record<SkyKind, SkyPalette> = {
  // 맑은 오후: 조명이 꺼져 있고 잔디·흙이 그대로 밝다
  day: {
    kind: 'day',
    skyTop: '#8fb4d2',
    standsTop: '#56697d',
    standsBottom: '#71808f',
    crowd: ['235,238,242', '170,186,205', '225,190,150'],
    crowdAlpha: 0.22,
    grassTop: '#2f7d4a',
    grassMid: '#3f9a5c',
    grassBottom: '#4bb06a',
    dirt: '#a97b52',
    moundTop: '#c39668',
    fence: '#15493a',
    glow: 0,
    light: '#ffffff',
    flashes: false,
    vignette: 0.32,
    chalk: 0.92,
  },
  // 해질녘: 하늘이 아직 타고 조명은 막 켜졌다. 169경기 중 41경기(24%)가 여기다
  dusk: {
    kind: 'dusk',
    skyTop: '#f08a4b',
    standsTop: '#3a2a3f',
    standsBottom: '#584059',
    crowd: ['246,214,180', '160,150,180', '220,170,140'],
    crowdAlpha: 0.16,
    grassTop: '#1b4630',
    grassMid: '#27653d',
    grassBottom: '#31804c',
    dirt: '#8a5c3c',
    moundTop: '#a97249',
    fence: '#102f27',
    glow: 0.55,
    light: '#ffd9a8',
    flashes: true,
    vignette: 0.48,
    chalk: 0.82,
  },
  // 밤: 지금까지 쓰던 그림. 조명이 꽉 차 있다
  night: {
    kind: 'night',
    skyTop: '#020305',
    standsTop: '#050a10',
    standsBottom: '#0c1218',
    crowd: ['210,215,222', '120,140,165', '200,160,120'],
    crowdAlpha: 0.13,
    grassTop: '#0d3322',
    grassMid: '#15512f',
    grassBottom: '#1c6a3e',
    dirt: '#6a4a31',
    moundTop: '#8a6143',
    fence: '#0a241d',
    glow: 1,
    light: '#fff1d6',
    flashes: true,
    vignette: 0.55,
    chalk: 0.75,
  },
  // 돔(고척): 하늘이 없다. 천장이라 위아래 밝기 차가 작고 빛이 차갑다
  dome: {
    kind: 'dome',
    skyTop: '#161b24',
    standsTop: '#161b24',
    standsBottom: '#222935',
    crowd: ['205,214,228', '130,150,178', '196,168,140'],
    crowdAlpha: 0.15,
    grassTop: '#16402c',
    grassMid: '#1d5638',
    grassBottom: '#246b45',
    dirt: '#5f4430',
    moundTop: '#7b5a3f',
    fence: '#0d2a22',
    glow: 0.35,
    light: '#dfe7f2',
    flashes: true,
    vignette: 0.42,
    chalk: 0.8,
  },
};

export function skyPalette(kind: SkyKind): SkyPalette {
  return PALETTES[kind];
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const byte = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** 두 #rrggbb를 t(0~1)로 섞는다. 홈팀 색을 관중석·펜스에 옅게 묻힐 때 쓴다 */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const r = byte(a, 1) + (byte(b, 1) - byte(a, 1)) * k;
  const g = byte(a, 3) + (byte(b, 3) - byte(a, 3)) * k;
  const bl = byte(a, 5) + (byte(b, 5) - byte(a, 5)) * k;
  return `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
}

/** "#rrggbb"를 rgba() 문자열로. 캔버스 그라디언트에 알파를 주려면 필요하다 */
export function rgbaOf(hex: string, alpha: number): string {
  return `rgba(${byte(hex, 1)},${byte(hex, 3)},${byte(hex, 5)},${clamp01(alpha)})`;
}
