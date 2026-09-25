import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame } from '../../test/fixtures/live';
import { fakeLiveApi, fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { GameSummary } from '../../types/live';
import { TeamScreen } from './TeamScreen';

const GAME = fixtureLiveGame();
const BASE = fixtureGameSummaries()[2]; // 끝난 경기 NC 4 : 7 KT

/** 2026-09 LG 경기 셋(두산 원정 둘, 홈 하나) */
const SEPTEMBER: GameSummary[] = [
  { ...BASE, gameId: '20260902LGOB02026', date: '2026-09-02', stadium: '잠실', away: { code: 'LG', name: 'LG', score: 5 }, home: { code: 'OB', name: '두산', score: 2 } },
  { ...BASE, gameId: '20260910OBLG02026', date: '2026-09-10', stadium: '잠실', away: { code: 'OB', name: '두산', score: 7 }, home: { code: 'LG', name: 'LG', score: 1 } },
  { ...BASE, gameId: '20260915LGOB02026', date: '2026-09-15', stadium: '잠실', away: { code: 'LG', name: 'LG', score: 3 }, home: { code: 'OB', name: '두산', score: 3 } },
];

const platformWith = (games: GameSummary[] = SEPTEMBER, game = GAME) =>
  fakePlatform({ liveApi: fakeLiveApi({ games, game }), today: () => '2026-09-20' });

beforeEach(() => {
  window.history.replaceState(null, '', '/#/team/LG');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('TeamScreen', () => {
  it('오늘이 든 달을 기본으로 그린다', async () => {
    renderWithGame(<TeamScreen code="LG" month={null} />, { platform: platformWith() });
    expect(await screen.findByRole('heading', { level: 2, name: 'LG · 2026년 9월' })).toBeInTheDocument();
  });

  it('주어진 달을 그린다', async () => {
    renderWithGame(<TeamScreen code="LG" month="2026-05" />, { platform: platformWith() });
    expect(await screen.findByRole('heading', { level: 2, name: 'LG · 2026년 5월' })).toBeInTheDocument();
  });

  it('경기가 있는 날에 상대 팀과 승패 한 글자를 둔다', async () => {
    // ADR-032: 칸이 좁아 스코어는 넣지 않는다
    renderWithGame(<TeamScreen code="LG" month="2026-09" />, { platform: platformWith() });
    const grid = await screen.findByRole('grid', { name: '2026년 9월 일정' });
    const cell = within(grid).getByRole('gridcell', { name: /^9월 2일/ });
    expect(cell).toHaveTextContent('두산');
    expect(cell).toHaveTextContent('승');
    expect(cell).not.toHaveTextContent('5');
  });

  it('경기가 없는 날은 누를 수 없다', async () => {
    renderWithGame(<TeamScreen code="LG" month="2026-09" />, { platform: platformWith() });
    const grid = await screen.findByRole('grid', { name: '2026년 9월 일정' });
    const empty = within(grid).getByRole('gridcell', { name: /^9월 3일/ });
    expect(within(empty).queryByRole('button')).toBeNull();
  });

  it('날짜를 누르면 아래에 그 경기 카드가 펼쳐지고 승부처가 보인다', async () => {
    const user = userEvent.setup();
    renderWithGame(<TeamScreen code="LG" month="2026-09" />, { platform: platformWith() });
    const grid = await screen.findByRole('grid', { name: '2026년 9월 일정' });
    await user.click(within(grid).getByRole('button', { name: /^9월 2일/ }));
    const card = await screen.findByRole('group', { name: '고른 경기' });
    expect(within(card).getByText('5 : 2')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '타석 전체 보기' })).toHaveAttribute('href', '#/game/20260902LGOB02026');
    await waitFor(() => expect(within(card).getAllByRole('link').length).toBeGreaterThan(1));
  });

  it('앞뒤 달로 옮긴다', async () => {
    const user = userEvent.setup();
    renderWithGame(<TeamScreen code="LG" month="2026-09" />, { platform: platformWith() });
    await screen.findByRole('grid', { name: '2026년 9월 일정' });
    await user.click(screen.getByRole('button', { name: '이전 달' }));
    expect(window.location.hash).toBe('#/team/LG?m=2026-08');
  });

  it('오늘이 든 달보다 뒤로는 가지 않는다', async () => {
    // ADR-032: 치러진 경기까지만 다룬다
    renderWithGame(<TeamScreen code="LG" month="2026-09" />, { platform: platformWith() });
    await screen.findByRole('grid', { name: '2026년 9월 일정' });
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled();
  });

  it('못 불러오면 다시 받을 수 있다', async () => {
    renderWithGame(<TeamScreen code="LG" month="2026-09" />, {
      platform: fakePlatform({ liveApi: fakeLiveApi({ fail: true }), today: () => '2026-09-20' }),
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeInTheDocument();
  });
});
