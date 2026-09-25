import type { EventIndex, GameState, MeasuredId, Verdict } from './domain.js';

export type TeamCode = 'HT' | 'LT' | 'NC' | 'HH' | 'LG' | 'OB' | 'SS' | 'SK' | 'KT' | 'WO';

export interface PlayerRecord {
  id: string;
  name: string;
  team: TeamCode;
  kind: 'H' | 'P';
  bats?: 'L' | 'R' | 'S';
  throws?: 'L' | 'R';
  /** 리그 대비 상대값, 길이 7 */
  rel: number[];
  /** 화면 표시용 시즌 기록. 타자: pa avg obp slg hr k bb / 투수: era ip k bb whip sv hold g */
  line: Record<string, number | string>;
}

export interface BullpenRecord {
  /** `${team}-pen` */
  id: string;
  team: TeamCode;
  name: string;
  rel: number[];
  /** 합친 구원투수 수 */
  n: number;
}

/** [type, speed, code(0 B,1 T,2 S,3 F,4 X), balls, strikes, stance(0 좌타,1 우타), x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz] — y0 = 55ft */
export type PitchRow = [
  number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
  number, number,
];

/*
 * 되돌려볼 수 있는 한 타석(ADR-016·032). 지난 경기의 어떤 타석이든 이 모양으로 모여 같은 타석 화면으로 들어간다.
 * 'custom'은 ARCHITECTURE의 계약이라 갈래만 남겨 두고 이번 범위에서는 만들지 않는다(ADR-032).
 */
export type SituationKind = 'live' | 'past' | 'custom';

export interface Situation {
  /** live·past: `${gameId}-${paNo}`, custom: `custom-${base64url(CustomForm JSON)}` */
  id: string;
  kind: SituationKind;
  gameId: string | null;
  paNo: number | null;
  /** YYYY-MM-DD (custom은 만든 날) */
  date: string;
  stadium: string | null;
  away: { code: TeamCode; name: string };
  home: { code: TeamCode; name: string };
  state: GameState;
  /** live·past는 0-0 */
  count: { balls: number; strikes: number };
  batter: string;
  pitcher: string;
  lineups: { away: string[]; home: string[] };
  actual: { result: string; event: EventIndex; runs: number; pitches: PitchRow[]; wpAfterHome: number | null } | null;
  /** 0~1 */
  naverWpBeforeHome: number | null;
  context: { tempC: number | null; windMs: number | null; dayGame: boolean; dome: boolean };
}

export interface CoreData {
  meta: { season: number; relayRange: [string, string]; relayGames: number; generatedAt: string; sources: string[] };
  /** 길이 7 리그 타석 결과 비율 */
  league: number[];
  /** 12행(볼 0~3 × 스트라이크 0~2, 인덱스 balls*3+strikes) × 5열(B,T,S,F,X), 행 합 1 */
  countTable: number[][];
  players: Record<string, PlayerRecord>;
  /** key: TeamCode */
  bullpens: Record<string, BullpenRecord>;
}

export interface PitchData {
  pitchTypes: string[];
  /**
   * 투수 손 기준 리그 투구 표본(ADR-035).
   * 투수별 표본은 담지 않는다: `/api/game`이 그 경기 실제 투구를 돌려주고, 모자라면 이 풀로 떨어진다.
   */
  pools: { L: PitchRow[]; R: PitchRow[] };
}

export interface EvidenceItem {
  id: MeasuredId;
  /** transform 한 단위당 log 득점 배수 */
  beta: number;
  se: number;
  /** beta 95% 구간 */
  ciLow: number;
  ciHigh: number;
  /** (exp(beta)-1)*100 */
  runsPctPerUnit: number;
  /** 학습 행 중 변수가 0이 아닌 팀-경기 수 */
  n: number;
  test: { devianceGainPerGame: number; ciLow: number; ciHigh: number; games: number };
  verdict: Verdict;
  note: string;
}

export interface EvidenceData {
  method: string;
  trainSeasons: number[];
  testSeason: number;
  games: { train: number; test: number };
  joint: { devianceGainPerGame: number; ciLow: number; ciHigh: number };
  items: EvidenceItem[];
}

export interface TrustData {
  games: number;
  plateAppearances: number;
  brier: { engine: number; naver: number; constant: number };
  logLoss: { engine: number; naver: number; constant: number };
  calibration: Array<{ lo: number; hi: number; predicted: number; actual: number; n: number }>;
  note: string;
}

export interface AppData {
  core: CoreData;
  pitches: PitchData;
  evidence: EvidenceData | null;
  trust: TrustData | null;
}
