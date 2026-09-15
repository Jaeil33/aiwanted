import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureAppData } from '../../test/fixtures/appData';
import { fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { AppData, SceneRecord } from '../../types/data';
import { LobbyScreen } from './LobbyScreen';

const SLOW = { timeout: 30_000 };
const A = fixtureAppData.scenes[0]; // 2026-08-15, 9회말 2사 만루, KIA 4 : 롯데 4, 홈타자6(좌타 .262) vs 원정투수(우투 ERA 3.12)
const B: SceneRecord = {
  ...A,
  id: 'scene-b',
  date: '2026-09-10',
  stadium: '두 번째 구장',
  title: '8회초 1사 1루',
  state: { ...A.state, inning: 8, half: 0, outs: 1, bases: 1, away: 2, home: 5 },
};
const C: SceneRecord = { ...A, id: 'scene-c', date: '2026-08-20', stadium: '세 번째 구장' };
const DATA: AppData = { ...fixtureAppData, scenes: [A, B, C] };

/** todaySceneIndex('2026-01-03', 3) = 2 → 오늘의 명장면은 C */
const renderLobby = (data: AppData = DATA) => renderWithGame(<LobbyScreen />, { data, platform: fakePlatform({ today: () => '2026-01-03' }) });

const clearHash = () => window.history.replaceState(null, '', '/');
beforeEach(clearHash);
afterEach(clearHash);

const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('LobbyScreen', () => {
  it('한 줄 소개(시안 tagline)와 스크린리더용 제목만 두고, 긴 설명·한 판 흐름은 없다', () => {
    renderLobby();
    expect(screen.getByRole('heading', { level: 2, name: '명장면 고르기' })).toBeInTheDocument();
    expect(screen.getByText('쓸모없는 변수, 진짜 쓸모없을까?')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '한 판은 이렇게' })).toBeNull();
    expect(screen.queryByText('방금 그 타석, 만약 그랬다면?')).toBeNull();
  });

  it('오늘의 명장면 카드: 날짜·구장, 원정·홈 이름과 점수, 주자·아웃, 제목, 타자·투수 기록, 다시 치르기 링크', () => {
    renderLobby();
    const today = within(screen.getByRole('region', { name: '오늘의 명장면' }));
    expect(today.getByText('오늘의 명장면 · 8월 20일 (목) · 세 번째 구장')).toBeInTheDocument();
    const away = today.getByText('원정').parentElement;
    const home = today.getByText('홈').parentElement;
    expect(away?.textContent).toBe('원정KIA4');
    expect(home?.textContent).toBe('홈롯데4');
    expect(today.getByRole('img', { name: '만루' })).toBeInTheDocument();
    expect(today.getByRole('img', { name: '2아웃' })).toBeInTheDocument();
    expect(today.getByRole('heading', { level: 3, name: C.title })).toBeInTheDocument();
    expect(flat(today.getByText('홈타자6').parentElement)).toBe('홈타자6 좌타 .262 vs 원정투수 우투 ERA 3.12');
    expect(today.getByRole('link', { name: 'TMI 걸고 다시 치르기' })).toHaveAttribute('href', '#/scene/scene-c');
  });

  it('승부처 지수는 계산 중 "…"이었다가 엔진 값(소수 한 자리)과 막대로 바뀐다', SLOW, async () => {
    renderLobby({ ...fixtureAppData, scenes: [A] });
    const today = within(screen.getByRole('region', { name: '오늘의 명장면' }));
    const row = today.getByText('승부처 지수').parentElement as HTMLElement;
    expect(within(row).getByText('…')).toBeInTheDocument();
    const value = await within(row).findByText(/^\d+\.\d$/, undefined, SLOW);
    const bar = row.querySelector('i');
    expect(bar).not.toBeNull();
    const width = Math.min(Number(value.textContent) / 40, 1) * 100;
    expect(Number.parseFloat(bar?.style.width ?? '')).toBeCloseTo(width, 0);
  });

  it('다른 명장면: 오늘 카드를 뺀 장면을 날짜 최신순 링크로, 장면 수와 함께', () => {
    renderLobby();
    const list = within(screen.getByRole('region', { name: '다른 명장면' }));
    expect(list.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#/scene/scene-b', '#/scene/fixture-walkoff']);
    expect(list.getByText('2장면')).toBeInTheDocument();
  });

  it('목록 한 줄: 날짜 MM.DD·구장, 두 팀 점수(공격 팀 표시), 이닝, 주자·아웃, 지수', async () => {
    renderLobby();
    const [rowB] = within(screen.getByRole('region', { name: '다른 명장면' })).getAllByRole('link');
    const row = within(rowB);
    expect(row.getByText('09.10')).toBeInTheDocument();
    expect(row.getByText('두 번째 구장')).toBeInTheDocument();
    expect(row.getByText('KIA').parentElement?.textContent).toBe('KIA2');
    expect(row.getByText('롯데').parentElement?.textContent).toBe('롯데5');
    expect(row.getByText('KIA').parentElement).toHaveAttribute('data-batting', 'true');
    expect(row.getByText('롯데').parentElement).toHaveAttribute('data-batting', 'false');
    expect(row.getByText('8회초')).toBeInTheDocument();
    expect(row.getByRole('img', { name: '1루' })).toBeInTheDocument();
    expect(row.getByRole('img', { name: '1아웃' })).toBeInTheDocument();
    expect(row.getByText(/^지수 (…|\d+\.\d)$/)).toBeInTheDocument();
  });

  it('실제 결과는 보여주지 않는다', () => {
    renderLobby();
    expect(screen.queryByText(A.actual.result)).toBeNull();
    expect(screen.queryByText(/홈런/)).toBeNull();
  });
});
