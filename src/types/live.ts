import type { PitchRow, TeamCode } from './data.js';
import type { EventIndex, GameState } from './domain.js';

/*
 * 네이버 중계를 줄인 앱 계약(ADR-017). 원본 정의는 docs/ARCHITECTURE.md "실시간 경기"다.
 * api/game.ts가 이 파일에 닿으므로 상대 import에 .js 확장자를 붙인다(ADR-028).
 */

export type GameStatus = 'before' | 'live' | 'final' | 'cancelled' | 'suspended';

export interface TeamLine {
  code: TeamCode;
  name: string;
  score: number | null;
}

export interface GameSummary {
  /** 네이버 경기 id: YYYYMMDD + 원정 코드 + 홈 코드 + 더블헤더 번호 + 시즌 (예: 20260915HTSK02026) */
  gameId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (KST) */
  time: string;
  stadium: string;
  away: TeamLine;
  home: TeamLine;
  status: GameStatus;
  /** 예: "7회말" */
  inningText: string | null;
}

export interface PaRecord {
  /** 경기 안 타석 순번, 1부터 시간 순 */
  no: number;
  /** 첫 투구 직전 상태(outs 0~2) */
  before: GameState;
  batter: string;
  /** 첫 투구의 투수(ADR-014) */
  pitcher: string;
  /** 그 시점 타순 0~8의 선수 id */
  lineups: { away: string[]; home: string[] };
  /** 중계 결과 문장 */
  result: string;
  /** 7사건으로 바꿀 수 없으면 null(주루사로 끝난 타석 등) */
  event: EventIndex | null;
  runs: number;
  /** 각 행의 balls·strikes는 투구 전 */
  pitches: PitchRow[];
  /** 결과로 끝났는가(교체·이닝 종료로 끊기면 false) */
  complete: boolean;
  /** 0~1, 네이버 */
  wpBeforeHome: number | null;
  wpAfterHome: number | null;
  /** 첫 투구 시각 HH:MM:SS (KST) */
  startedAt: string | null;
}

export interface LiveGame {
  summary: GameSummary;
  names: Record<string, string>;
  hands: Record<string, { bats?: 'L' | 'R' | 'S'; throws?: 'L' | 'R' }>;
  /** no 오름차순 */
  plateAppearances: PaRecord[];
  /** 진행 중 타석. 없으면 null */
  current: { state: GameState; balls: number; strikes: number; batter: string; pitcher: string } | null;
  /** ISO 8601 */
  fetchedAt: string;
}
