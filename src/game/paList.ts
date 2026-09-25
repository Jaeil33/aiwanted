import { basesText } from '../domain/format';
import type { TeamCode } from '../types/data';
import type { Bases, Half } from '../types/domain';
import type { GameSummary, LiveGame } from '../types/live';

/*
 * 경기 목록·타석 목록 화면(ADR-032)의 파생 값. 순수 모듈이다.
 *
 * 목록에는 **실제 결과 문장을 담지 않는다**. 결과를 미리 보여 주면 되돌려볼 재미가 없다.
 * 추천 승부처는 네이버 승리확률이 그 타석에서 움직인 폭으로 고르되, 그 숫자는 내보내지 않는다(ADR-014).
 */

const HALF_TEXT = ['초', '말'] as const;
const OUTS_TEXT = ['무사', '1사', '2사', '3아웃'];

/** 이닝을 뺀 상황 한 줄: "2사 만루". 이닝은 inningText가 따로 적는다 */
const outsBasesText = (outs: number, bases: Bases) => `${OUTS_TEXT[Math.min(outs, 3)]} ${basesText(bases)}`;

export interface PaListRow {
  no: number;
  inning: number;
  half: Half;
  /** "9회말" */
  inningText: string;
  /** "2사 만루" */
  situationText: string;
  /** 타자 이름(모르면 id) */
  batter: string;
  /** 투수 이름(모르면 id) */
  pitcher: string;
  /** 타석 직전 점수 */
  score: { away: number; home: number };
  /** 실제 결과가 남아 있어 되돌려보고 견줄 수 있는가 */
  hasActual: boolean;
  /** 추천 승부처 */
  highlight: boolean;
}

export interface PaListOptions {
  /** 추천 승부처로 고를 개수. 없으면 고르지 않는다 */
  highlights?: number;
  /**
   * 선수 id → 이름. 중계 이름보다 먼저 본다.
   * 중계에는 타석에 선 선수만 있어 **투수 이름이 없다**: 번들 core의 이름표(`nameMapOf`)를 넘겨야 한다.
   */
  names?: Record<string, string>;
}

/** 그 타석에서 홈 승리확률이 움직인 폭(0~1). 둘 중 하나라도 모르면 null */
function swingOf(before: number | null, after: number | null): number | null {
  return before === null || after === null ? null : Math.abs(after - before);
}

/** 경기의 타석을 화면 한 줄씩으로. 번호·순서는 그대로 둔다 */
export function paList(game: LiveGame, opts: PaListOptions = {}): PaListRow[] {
  const known = opts.names ?? {};
  const nameOf = (id: string) =>
    Object.hasOwn(known, id) ? known[id] : Object.hasOwn(game.names, id) ? game.names[id] : id;
  const swings = game.plateAppearances.map((pa) => swingOf(pa.wpBeforeHome, pa.wpAfterHome));

  const picked = new Set<number>();
  const count = opts.highlights ?? 0;
  if (count > 0) {
    const ranked = game.plateAppearances
      .map((pa, i) => ({ no: pa.no, swing: swings[i] }))
      .filter((x): x is { no: number; swing: number } => x.swing !== null)
      // 같은 폭이면 앞선 타석을 먼저 고른다(고르는 값이 흔들리지 않게)
      .sort((a, b) => b.swing - a.swing || a.no - b.no)
      .slice(0, count);
    for (const x of ranked) picked.add(x.no);
  }

  return game.plateAppearances.map((pa) => {
    const { before } = pa;
    return {
      no: pa.no,
      inning: before.inning,
      half: before.half,
      inningText: `${before.inning}회${HALF_TEXT[before.half]}`,
      situationText: outsBasesText(before.outs, before.bases),
      batter: nameOf(pa.batter),
      pitcher: nameOf(pa.pitcher),
      score: { away: before.away, home: before.home },
      hasActual: pa.complete && pa.event !== null,
      highlight: picked.has(pa.no),
    };
  });
}

export interface HalfBlock {
  inning: number;
  half: Half;
  /** "9회말" */
  inningText: string;
  rows: PaListRow[];
}

/** 타석 줄을 반이닝마다 묶는다(목록 머리말용). 순서는 그대로 */
export function halfBlocks(rows: readonly PaListRow[]): HalfBlock[] {
  const blocks: HalfBlock[] = [];
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    if (!last || last.inning !== row.inning || last.half !== row.half) {
      blocks.push({ inning: row.inning, half: row.half, inningText: row.inningText, rows: [row] });
      continue;
    }
    last.rows.push(row);
  }
  return blocks;
}

/** 그 팀이 나온 경기만. team이 null이면 그대로 */
export function gamesOfTeam(games: readonly GameSummary[], team: TeamCode | null): GameSummary[] {
  if (team === null) return [...games];
  return games.filter((g) => g.away.code === team || g.home.code === team);
}

export interface DateGroup {
  date: string;
  games: GameSummary[];
}

/** 날짜마다 묶는다. 최근 날짜가 먼저, 같은 날 안에서는 시작 시각 순 */
export function gamesByDate(games: readonly GameSummary[]): DateGroup[] {
  const byDate = new Map<string, GameSummary[]>();
  for (const game of games) {
    const list = byDate.get(game.date);
    if (list) list.push(game);
    else byDate.set(game.date, [game]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, list]) => ({
      date,
      games: [...list].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.gameId < b.gameId ? -1 : 1)),
    }));
}
