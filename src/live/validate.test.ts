import { describe, expect, it } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame } from '../test/fixtures/live';
import { isGameSummary, isGameSummaryList, isLiveGame } from './validate';

/*
 * 서버가 돌려준 값을 믿지 않고 모양을 검사한다. 여기서 막지 못하면 잘못된 모양이
 * 엔진까지 흘러가 화면이 조용히 틀린 경기를 보여준다.
 */

const clone = <T>(x: T): T => structuredClone(x);
const loose = (x: unknown) => x as Record<string, unknown>;

describe('isGameSummary', () => {
  const good = fixtureGameSummaries()[1];

  it('픽스처 셋을 모두 받는다', () => {
    for (const g of fixtureGameSummaries()) expect(isGameSummary(g)).toBe(true);
  });

  it('레코드가 아니면 거절한다', () => {
    for (const x of [null, undefined, 1, 'x', [], true]) expect(isGameSummary(x)).toBe(false);
  });

  it('경기 id 모양이 틀리면 거절한다', () => {
    for (const id of ['', '20260915', 'abc', '20260915HTSK', '20260915hts k02026']) {
      expect(isGameSummary({ ...good, gameId: id })).toBe(false);
    }
  });

  it('날짜·시각 모양이 틀리면 거절한다', () => {
    expect(isGameSummary({ ...good, date: '2026/09/15' })).toBe(false);
    expect(isGameSummary({ ...good, time: '6:30' })).toBe(false);
  });

  it('모르는 상태면 거절한다', () => {
    expect(isGameSummary({ ...good, status: 'postponed' })).toBe(false);
  });

  it('팀 모양이 틀리면 거절한다', () => {
    expect(isGameSummary({ ...good, away: { code: 'LG', name: 'LG' } })).toBe(false);
    expect(isGameSummary({ ...good, home: null })).toBe(false);
  });

  it('점수는 숫자나 null만 받는다', () => {
    expect(isGameSummary({ ...good, away: { ...good.away, score: null } })).toBe(true);
    expect(isGameSummary({ ...good, away: { ...good.away, score: '2' } })).toBe(false);
  });
});

describe('isGameSummaryList', () => {
  it('배열이면 받고 빈 배열도 받는다', () => {
    expect(isGameSummaryList(fixtureGameSummaries())).toBe(true);
    expect(isGameSummaryList([])).toBe(true);
  });

  it('하나라도 모양이 틀리면 거절한다', () => {
    expect(isGameSummaryList([...fixtureGameSummaries(), { gameId: 'x' }])).toBe(false);
    expect(isGameSummaryList({})).toBe(false);
  });
});

describe('isLiveGame', () => {
  const good = fixtureLiveGame();

  it('픽스처를 받는다', () => {
    expect(isLiveGame(good)).toBe(true);
  });

  it('진행 중 타석이 없어도 받는다', () => {
    expect(isLiveGame({ ...clone(good), current: null })).toBe(true);
  });

  it('타석이 비어 있어도 받는다 (경기 전)', () => {
    expect(isLiveGame({ ...clone(good), plateAppearances: [] })).toBe(true);
  });

  it('요약이 틀리면 거절한다', () => {
    const bad = clone(good);
    loose(bad).summary = { gameId: 'x' };
    expect(isLiveGame(bad)).toBe(false);
  });

  it('타선이 9명이 아니면 거절한다', () => {
    const bad = clone(good);
    bad.plateAppearances[0].lineups.away = ['a1'];
    expect(isLiveGame(bad)).toBe(false);
  });

  it('투구 행 길이가 16이 아니면 거절한다', () => {
    const bad = clone(good);
    loose(bad.plateAppearances[0]).pitches = [[1, 2, 3]];
    expect(isLiveGame(bad)).toBe(false);
  });

  it('사건이 0~6이나 null이 아니면 거절한다', () => {
    const bad = clone(good);
    loose(bad.plateAppearances[0]).event = 9;
    expect(isLiveGame(bad)).toBe(false);
  });

  it('끝나지 않은 타석의 null 사건은 받는다', () => {
    expect(isLiveGame(good)).toBe(true);
    expect(good.plateAppearances.some((pa) => pa.event === null)).toBe(true);
  });

  it('타석 번호가 오름차순이 아니면 거절한다', () => {
    const bad = clone(good);
    bad.plateAppearances[0].no = 99;
    expect(isLiveGame(bad)).toBe(false);
  });

  it('레코드가 아니면 거절한다', () => {
    for (const x of [null, undefined, 1, 'x', []]) expect(isLiveGame(x)).toBe(false);
  });
});
