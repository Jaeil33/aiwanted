import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureAppData } from '../../test/fixtures/appData';
import { fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { AppData, SceneRecord } from '../../types/data';
import { LobbyScreen } from './LobbyScreen';

const A = fixtureAppData.scenes[0]; // 2026-08-15
const B: SceneRecord = { ...A, id: 'scene-b', date: '2026-08-25', stadium: '두 번째 구장' };
const C: SceneRecord = { ...A, id: 'scene-c', date: '2026-08-20', stadium: '세 번째 구장' };
const DATA: AppData = { ...fixtureAppData, scenes: [A, B, C] };

/** todaySceneIndex('2026-01-03', 3) = 2 → 오늘의 타석은 C */
const renderLobby = () => renderWithGame(<LobbyScreen />, { data: DATA, platform: fakePlatform({ today: () => '2026-01-03' }) });

const clearHash = () => window.history.replaceState(null, '', '/');
beforeEach(clearHash);
afterEach(clearHash);

describe('LobbyScreen', () => {
  it('한 줄 제목과 설명', () => {
    renderLobby();
    expect(screen.getByRole('heading', { level: 2, name: '방금 그 타석, 만약 그랬다면?' })).toBeInTheDocument();
    expect(screen.getByText('실제 KBO 타석에 쓸데없는 TMI를 걸면, 그 결과가 나올 확률이 얼마나 바뀌는지 엔진이 계산하고 그 타석을 다시 쳐봐요.')).toBeInTheDocument();
  });

  it('오늘의 타석은 날짜로 고른 장면의 큰 카드이고 그 타석으로 간다', () => {
    renderLobby();
    const today = screen.getByRole('region', { name: '오늘의 타석' });
    const link = within(today).getByRole('link');
    expect(link).toHaveAttribute('href', '#/scene/scene-c');
    expect(within(link).getByText('8.20 (목)')).toBeInTheDocument();
    expect(within(link).getByText('이 타석에 TMI 걸기')).toBeInTheDocument();
  });

  it('지난 경기 승부처는 날짜 최신순 링크 목록과 타석 수', () => {
    renderLobby();
    const past = screen.getByRole('region', { name: '지난 경기 승부처' });
    expect(within(past).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#/scene/scene-b', '#/scene/scene-c', '#/scene/fixture-walkoff']);
    expect(within(past).getByText('3타석')).toBeInTheDocument();
  });

  it('선수 이름은 core 기록에서 가져오고 실제 결과는 보여주지 않는다', () => {
    renderLobby();
    expect(screen.getAllByText('홈타자6').length).toBeGreaterThan(0);
    expect(screen.getAllByText('원정투수').length).toBeGreaterThan(0);
    expect(screen.queryByText(A.actual.result)).toBeNull();
  });

  it('한 판 흐름 세 단계를 순서대로 보여준다', () => {
    renderLobby();
    const how = screen.getByRole('region', { name: '한 판은 이렇게' });
    const steps = within(how).getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain('타석 고르기');
    expect(steps[1]).toContain('TMI 한 줄');
    expect(steps[2]).toContain('한 타석 쳐보기');
  });
});
