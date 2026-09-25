import { describe, expect, it } from 'vitest';
import { fixtureGameSummaries } from '../test/fixtures/live';
import type { GameSummary } from '../types/live';
import { addDays, calendarWeeks, finishedGames, monthOf, monthRange, recentFinished, resultOf, scoreText, shiftMonth, teamScore } from './season';

/*
 * 팀 달력·최근 경기(ADR-032). 순수 함수라 시계를 읽지 않는다.
 */

const SUMMARIES = fixtureGameSummaries();
const finalGame = SUMMARIES[2]; // 2026-09-14 NC 4 : 7 KT

const game = (over: Partial<GameSummary> & { gameId: string }): GameSummary => ({ ...finalGame, ...over });

describe('monthOf·monthRange', () => {
  it('날짜에서 달을 읽는다', () => {
    expect(monthOf('2026-09-15')).toBe('2026-09');
  });

  it('달의 첫날과 마지막 날을 낸다', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('shiftMonth·addDays', () => {
  it('달을 옮긴다', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-09', 0)).toBe('2026-09');
  });

  it('날짜를 옮긴다', () => {
    expect(addDays('2026-09-15', -14)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('finishedGames·recentFinished', () => {
  it('끝난 경기만 남긴다', () => {
    // 경기 전·진행 중·취소는 되돌려볼 타석이 없다
    expect(finishedGames(SUMMARIES).map((g) => g.gameId)).toEqual([finalGame.gameId]);
  });

  it('최근 경기부터 준다', () => {
    const games = [
      game({ gameId: '20260910LGOB02026', date: '2026-09-10' }),
      game({ gameId: '20260915LGOB02026', date: '2026-09-15' }),
      game({ gameId: '20260912LGOB02026', date: '2026-09-12' }),
    ];
    expect(recentFinished(games, 2).map((g) => g.date)).toEqual(['2026-09-15', '2026-09-12']);
  });

  it('같은 날이면 늦게 시작한 경기가 먼저다', () => {
    const games = [
      game({ gameId: '20260915LGOB02026', date: '2026-09-15', time: '14:00' }),
      game({ gameId: '20260915HTSK02026', date: '2026-09-15', time: '18:30' }),
    ];
    expect(recentFinished(games, 1).map((g) => g.time)).toEqual(['18:30']);
  });

  it('개수를 넘겨도 있는 만큼만 준다', () => {
    expect(recentFinished(SUMMARIES, 10)).toHaveLength(1);
    expect(recentFinished([], 3)).toEqual([]);
  });
});

describe('resultOf', () => {
  it('그 팀이 이겼는지 한 글자로', () => {
    expect(resultOf(finalGame, 'KT')).toBe('승');
    expect(resultOf(finalGame, 'NC')).toBe('패');
  });

  it('같은 점수면 무', () => {
    expect(resultOf(game({ gameId: 'x', away: { ...finalGame.away, score: 3 }, home: { ...finalGame.home, score: 3 } }), 'KT')).toBe('무');
  });

  it('끝나지 않았거나 점수를 모르거나 그 팀 경기가 아니면 null', () => {
    expect(resultOf(SUMMARIES[0], 'LG')).toBeNull();
    expect(resultOf(finalGame, 'LG')).toBeNull();
    expect(resultOf(game({ gameId: 'x', home: { ...finalGame.home, score: null } }), 'KT')).toBeNull();
  });
});

describe('scoreText', () => {
  it('원정 : 홈 순서다', () => {
    expect(scoreText(finalGame)).toBe('4 : 7');
  });

  it('점수를 모르면 빈 문자열', () => {
    expect(scoreText(SUMMARIES[0])).toBe('');
  });
});

describe('teamScore', () => {
  it('그 팀에서 본 점수를 낸다', () => {
    // 2026-09-14 NC 4 : 7 KT
    expect(teamScore(finalGame, 'KT')).toEqual({ scored: 7, allowed: 4 });
    expect(teamScore(finalGame, 'NC')).toEqual({ scored: 4, allowed: 7 });
  });

  it('진행 중 경기도 지금 점수를 낸다', () => {
    // 달력은 승패를 못 적어도 점수는 적는다: resultOf와 달리 끝난 경기만 보지 않는다
    expect(teamScore(SUMMARIES[1], 'LG')).toEqual({ scored: 2, allowed: 0 });
    expect(resultOf(SUMMARIES[1], 'LG')).toBeNull();
  });

  it('점수를 모르거나 그 팀 경기가 아니면 null', () => {
    expect(teamScore(SUMMARIES[0], 'HT')).toBeNull();
    expect(teamScore(finalGame, 'LG')).toBeNull();
    expect(teamScore(game({ gameId: 'x', home: { ...finalGame.home, score: null } }), 'KT')).toBeNull();
  });
});

describe('calendarWeeks', () => {
  const games = [
    game({ gameId: '20260901KTNC02026', date: '2026-09-01' }),
    game({ gameId: '20260915KTNC02026', date: '2026-09-15' }),
    game({ gameId: '20260930KTNC02026', date: '2026-09-30' }),
  ];

  it('일요일로 시작하는 주 묶음을 낸다', () => {
    const weeks = calendarWeeks('2026-09', games, 'KT');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 2026-09-01은 화요일이다: 첫 주 앞 두 칸은 비어 있다
    expect(weeks[0].slice(0, 2).every((c) => c.date === null)).toBe(true);
    expect(weeks[0][2].date).toBe('2026-09-01');
  });

  it('그 달의 날을 빠짐없이 담는다', () => {
    const dates = calendarWeeks('2026-09', games, 'KT').flat().map((c) => c.date).filter(Boolean);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates[29]).toBe('2026-09-30');
  });

  it('경기가 있는 날에는 상대 팀·승패·스코어를 담는다', () => {
    const cells = calendarWeeks('2026-09', games, 'KT').flat();
    const day15 = cells.find((c) => c.date === '2026-09-15');
    expect(day15?.game?.gameId).toBe('20260915KTNC02026');
    expect(day15?.opponent).toBe('NC');
    expect(day15?.home).toBe(true);
    expect(day15?.result).toBe('승');
    // 20-browse-ui step 0: 칸에 스코어를 넣는다. 그 팀 득점이 앞이다
    expect(day15?.score).toEqual({ scored: 7, allowed: 4 });
  });

  it('경기가 없는 날은 비어 있다', () => {
    const cells = calendarWeeks('2026-09', games, 'KT').flat();
    const day2 = cells.find((c) => c.date === '2026-09-02');
    expect(day2?.game).toBeNull();
    expect(day2?.opponent).toBeNull();
    expect(day2?.score).toBeNull();
  });

  it('그 달이 아닌 경기는 담지 않는다', () => {
    const cells = calendarWeeks('2026-08', games, 'KT').flat();
    expect(cells.every((c) => c.game === null)).toBe(true);
  });

  it('하루에 두 경기(더블헤더)면 먼저 시작한 경기를 담는다', () => {
    const doubled = [
      game({ gameId: '20260915KTNC12026', date: '2026-09-15', time: '17:00' }),
      game({ gameId: '20260915KTNC02026', date: '2026-09-15', time: '13:00' }),
    ];
    const cells = calendarWeeks('2026-09', doubled, 'KT').flat();
    expect(cells.find((c) => c.date === '2026-09-15')?.game?.gameId).toBe('20260915KTNC02026');
  });
});
