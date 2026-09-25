import type { TeamCode } from '../types/data';
import type { GameSummary } from '../types/live';

/*
 * 시즌 탐색(ADR-032)의 파생 값: 달 범위, 끝난 경기 고르기, 팀 달력 격자.
 * 순수 모듈이다 — 시계를 읽지 않는다(오늘 날짜는 부르는 쪽이 `platform.today()`로 준다).
 */

const DAYS_IN_WEEK = 7;

/** "2026-09-15" → "2026-09" */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** "2026-09" → 그 달의 첫날·마지막 날 */
export function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split('-').map(Number);
  // Date.UTC(y, m, 0)은 m월의 0일 = (m−1)월의 마지막 날이다. 시계를 읽지 않는 계산이다
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** 달을 옮긴다: shiftMonth('2026-01', -1) → '2025-12' */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 날짜를 옮긴다: addDays('2026-03-01', -1) → '2026-02-28' */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 되돌려볼 타석이 있는 경기: 끝난 경기만 */
export function finishedGames(games: readonly GameSummary[]): GameSummary[] {
  return games.filter((g) => g.status === 'final');
}

/** 늦게 치른 경기부터. 같은 날이면 늦게 시작한 경기가 먼저다 */
export function recentFinished(games: readonly GameSummary[], count: number): GameSummary[] {
  return finishedGames(games)
    .sort((a, b) => (a.date === b.date ? (a.time < b.time ? 1 : a.time > b.time ? -1 : 0) : a.date < b.date ? 1 : -1))
    .slice(0, Math.max(0, count));
}

export type GameResult = '승' | '패' | '무';

/** 그 팀이 이겼는지 한 글자로. 끝나지 않았거나 점수를 모르거나 그 팀 경기가 아니면 null */
export function resultOf(game: GameSummary, team: TeamCode): GameResult | null {
  if (game.status !== 'final') return null;
  const { away, home } = game;
  if (away.score === null || home.score === null) return null;
  const mine = away.code === team ? away.score : home.code === team ? home.score : null;
  if (mine === null) return null;
  const theirs = away.code === team ? home.score : away.score;
  return mine > theirs ? '승' : mine < theirs ? '패' : '무';
}

export interface TeamScore {
  /** 그 팀 점수 */
  mine: number;
  /** 상대 점수 */
  theirs: number;
}

/**
 * 그 팀에서 본 점수. 점수를 모르거나 그 팀 경기가 아니면 null.
 * `resultOf`와 달리 끝난 경기만 보지 않는다 — 달력은 승패를 못 적는 경기에도 지금 점수를 적는다.
 */
export function teamScore(game: GameSummary, team: TeamCode): TeamScore | null {
  const { away, home } = game;
  if (away.score === null || home.score === null) return null;
  if (away.code === team) return { mine: away.score, theirs: home.score };
  if (home.code === team) return { mine: home.score, theirs: away.score };
  return null;
}

/** "4 : 7"(원정 : 홈). 점수를 모르면 빈 문자열 */
export function scoreText(game: GameSummary): string {
  const { away, home } = game;
  return away.score === null || home.score === null ? '' : `${away.score} : ${home.score}`;
}

export interface CalendarCell {
  /** 그 달의 날. 앞뒤 빈 칸은 null */
  date: string | null;
  /** 1~31. 빈 칸은 null */
  day: number | null;
  game: GameSummary | null;
  /** 상대 팀 코드 */
  opponent: TeamCode | null;
  /** 내 팀이 홈이면 true */
  home: boolean;
  result: GameResult | null;
  /** 내 팀에서 본 점수. 아직 점수가 없으면 null */
  score: TeamScore | null;
}

const EMPTY_CELL: CalendarCell = { date: null, day: null, game: null, opponent: null, home: false, result: null, score: null };

/**
 * 한 달 달력 격자(일요일 시작, 7칸씩). 칸에는 상대 팀·승패·스코어를 담는다.
 * 하루에 두 경기면 먼저 시작한 경기를 담는다.
 */
export function calendarWeeks(month: string, games: readonly GameSummary[], team: TeamCode): CalendarCell[][] {
  const { to } = monthRange(month);
  const lastDay = Number(to.slice(8));
  const firstWeekday = new Date(`${month}-01T00:00:00Z`).getUTCDay();

  const byDate = new Map<string, GameSummary>();
  for (const game of games) {
    if (monthOf(game.date) !== month) continue;
    if (game.away.code !== team && game.home.code !== team) continue;
    const kept = byDate.get(game.date);
    if (!kept || game.time < kept.time) byDate.set(game.date, game);
  }

  const cells: CalendarCell[] = Array.from({ length: firstWeekday }, () => EMPTY_CELL);
  for (let day = 1; day <= lastDay; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const game = byDate.get(date) ?? null;
    const home = game !== null && game.home.code === team;
    cells.push({
      date,
      day,
      game,
      opponent: game === null ? null : home ? game.away.code : game.home.code,
      home,
      result: game === null ? null : resultOf(game, team),
      score: game === null ? null : teamScore(game, team),
    });
  }
  while (cells.length % DAYS_IN_WEEK !== 0) cells.push(EMPTY_CELL);

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += DAYS_IN_WEEK) weeks.push(cells.slice(i, i + DAYS_IN_WEEK));
  return weeks;
}
