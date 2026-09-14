import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureAppData } from '../../test/fixtures/appData';
import { fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { AppData, SceneRecord } from '../../types/data';
import { HomeScreen } from './HomeScreen';

const A = fixtureAppData.scenes[0]; // 2026-08-15
const B: SceneRecord = { ...A, id: 'scene-b', title: '8회초 1사 1루, 두 번째 장면', date: '2026-08-25', stadium: '두 번째 구장' };
const C: SceneRecord = { ...A, id: 'scene-c', title: '7회말 무사 주자 없음, 세 번째 장면', date: '2026-08-20', stadium: '세 번째 구장' };
const DATA: AppData = { ...fixtureAppData, scenes: [A, B, C] };

/** todaySceneIndex('2026-01-03', 3) = 2 → 오늘의 장면은 C */
const renderHome = () => renderWithGame(<HomeScreen />, { data: DATA, platform: fakePlatform({ today: () => '2026-01-03' }) });

const clearHash = () => window.history.replaceState(null, '', '/');
beforeEach(clearHash);
afterEach(clearHash);

describe('HomeScreen', () => {
  it('부제와 한 줄 설명을 보여준다', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 2, name: '쓸모없는 변수, 진짜 쓸모없을까?' })).toBeInTheDocument();
    expect(
      screen.getByText('실제 KBO 명장면에 쓸데없는 TMI를 걸면, 타석·이닝·경기 승률이 어떻게 바뀌는지 계산하고 그 장면을 다시 치러요.'),
    ).toBeInTheDocument();
  });

  it('오늘의 장면 카드와 "이 장면에 TMI 걸기" 버튼이 그 장면의 play 해시로 간다', async () => {
    renderHome();
    const today = screen.getByRole('region', { name: '오늘의 장면' });
    expect(within(today).getByText(C.title)).toBeInTheDocument();
    const button = within(today).getByRole('link', { name: '이 장면에 TMI 걸기' });
    expect(button).toHaveAttribute('href', '#/scene/scene-c');
    fireEvent.click(button);
    // jsdom은 링크 이동(해시 변경)을 다음 작업에서 반영한다
    await waitFor(() => expect(window.location.hash).toBe('#/scene/scene-c'));
  });

  it('흐름 안내 세 단계를 순서대로 보여준다', () => {
    renderHome();
    const flow = screen.getByRole('region', { name: '한 판은 이렇게' });
    const steps = within(flow).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain('장면 고르기');
    expect(steps[1]).toContain('TMI 한 줄');
    expect(steps[2]).toContain('다시 치르기');
  });

  it('모든 장면을 날짜 최신순 카드 링크로 보여준다', () => {
    renderHome();
    const all = screen.getByRole('region', { name: '모든 장면' });
    expect(within(all).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#/scene/scene-b',
      '#/scene/scene-c',
      '#/scene/fixture-walkoff',
    ]);
  });

  it('판정소·만든 이유로 가는 링크가 있다', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /판정소/ })).toHaveAttribute('href', '#/evidence');
    expect(screen.getByRole('link', { name: '만든 이유' })).toHaveAttribute('href', '#/about');
  });

  it('실제 결과(결과 문장·최종 점수)를 보여주지 않는다', () => {
    const { container } = renderHome();
    const text = container.textContent ?? '';
    expect(text).not.toContain(A.actual.result);
    expect(text).not.toContain('만루 홈런');
    expect(text).not.toMatch(/4\s*:\s*8/);
  });
});
