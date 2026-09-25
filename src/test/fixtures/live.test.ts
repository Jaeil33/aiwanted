import { describe, expect, it } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame, fixtureSituations } from './live';

/** 네이버 경기 id: YYYYMMDD + 원정 코드 + 홈 코드 + 더블헤더 번호 + 시즌 */
const GAME_ID = /^\d{8}[A-Z]{4}\d{5}$/;
const STATUSES = ['before', 'live', 'final', 'cancelled', 'suspended'];
const PITCH_ROW_LENGTH = 16;

describe('fixtureGameSummaries', () => {
  const games = fixtureGameSummaries();

  it('경기 전·진행 중·끝난 경기를 모두 담는다', () => {
    expect(games.map((g) => g.status)).toEqual(expect.arrayContaining(['before', 'live', 'final']));
  });

  it('id·날짜·시각 모양이 계약대로다', () => {
    for (const g of games) {
      expect(g.gameId).toMatch(GAME_ID);
      expect(g.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.time).toMatch(/^\d{2}:\d{2}$/);
      expect(STATUSES).toContain(g.status);
    }
  });

  it('경기 전에는 점수가 null, 끝난 경기에는 숫자다', () => {
    const before = games.find((g) => g.status === 'before')!;
    expect(before.away.score).toBeNull();
    expect(before.home.score).toBeNull();
    const final = games.find((g) => g.status === 'final')!;
    expect(typeof final.away.score).toBe('number');
    expect(typeof final.home.score).toBe('number');
  });

  it('이닝 표시는 진행 중일 때만 있다', () => {
    expect(games.find((g) => g.status === 'live')!.inningText).toMatch(/회(초|말)$/);
    expect(games.find((g) => g.status === 'before')!.inningText).toBeNull();
  });
});

describe('fixtureLiveGame', () => {
  const game = fixtureLiveGame();

  it('타석 8개가 no 오름차순이고 1부터 센다', () => {
    expect(game.plateAppearances).toHaveLength(8);
    expect(game.plateAppearances.map((pa) => pa.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('모든 타석의 타선은 양쪽 9명이고 투구 전 아웃은 0~2다', () => {
    for (const pa of game.plateAppearances) {
      expect(pa.lineups.away).toHaveLength(9);
      expect(pa.lineups.home).toHaveLength(9);
      expect(pa.before.outs).toBeGreaterThanOrEqual(0);
      expect(pa.before.outs).toBeLessThanOrEqual(2);
      expect(pa.before.bases).toBeGreaterThanOrEqual(0);
      expect(pa.before.bases).toBeLessThanOrEqual(7);
    }
  });

  it('투구 행은 길이 16이고 볼카운트는 투구 전 값이다', () => {
    for (const pa of game.plateAppearances) {
      for (const row of pa.pitches) expect(row).toHaveLength(PITCH_ROW_LENGTH);
      // 첫 투구 전은 언제나 0-0
      if (pa.pitches.length > 0) expect([pa.pitches[0][3], pa.pitches[0][4]]).toEqual([0, 0]);
    }
  });

  it('주루사로 끊긴 타석은 complete false이고 event가 null이다', () => {
    const broken = game.plateAppearances.filter((pa) => !pa.complete);
    expect(broken).toHaveLength(1);
    expect(broken[0].event).toBeNull();
  });

  it('끝난 타석은 모두 event가 있다', () => {
    for (const pa of game.plateAppearances.filter((pa) => pa.complete)) {
      expect(pa.event).not.toBeNull();
      expect(pa.event).toBeGreaterThanOrEqual(0);
      expect(pa.event).toBeLessThanOrEqual(6);
    }
  });

  it('2점 홈런·병살·대타 교체·반이닝 전환이 들어 있다', () => {
    const pas = game.plateAppearances;
    expect(pas.some((pa) => pa.event === 2 && pa.runs === 2)).toBe(true);
    expect(pas.some((pa) => pa.result.includes('병살'))).toBe(true);
    expect(pas.some((pa) => pa.result.includes('대타'))).toBe(true);
    // 반이닝 전환: 초 공격 타석과 말 공격 타석이 모두 있다
    expect(new Set(pas.map((pa) => pa.before.half))).toEqual(new Set([0, 1]));
  });

  it('이름·손 표에 타석에 선 선수가 모두 있다', () => {
    for (const pa of game.plateAppearances) {
      expect(game.names[pa.batter]).toBeTruthy();
      expect(game.names[pa.pitcher]).toBeTruthy();
    }
  });

  it('진행 중 타석이 하나 있다', () => {
    expect(game.current).not.toBeNull();
    expect(game.current!.balls).toBeGreaterThanOrEqual(0);
    expect(game.current!.balls).toBeLessThanOrEqual(3);
    expect(game.current!.strikes).toBeGreaterThanOrEqual(0);
    expect(game.current!.strikes).toBeLessThanOrEqual(2);
  });
});

describe('fixtureSituations', () => {
  const situations = fixtureSituations();

  it('live·past를 담는다 (custom은 범위 밖)', () => {
    expect(situations.map((s) => s.kind).sort()).toEqual(['live', 'past']);
  });

  it('id는 `${gameId}-${paNo}`이고 볼카운트는 0-0이다', () => {
    for (const s of situations) {
      expect(s.id).toBe(`${s.gameId}-${s.paNo}`);
      expect(s.count).toEqual({ balls: 0, strikes: 0 });
      expect(s.lineups.away).toHaveLength(9);
      expect(s.lineups.home).toHaveLength(9);
    }
  });

  it('지난 경기 상황에는 실제 결과가 있다', () => {
    const past = situations.find((s) => s.kind === 'past')!;
    expect(past.actual).not.toBeNull();
    expect(past.actual!.event).toBeGreaterThanOrEqual(0);
    for (const row of past.actual!.pitches) expect(row).toHaveLength(PITCH_ROW_LENGTH);
  });
});
