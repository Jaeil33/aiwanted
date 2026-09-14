import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import { fakePlatform } from '../test/gameHarness';
import type { AppData, SceneRecord } from '../types/data';
import { App } from './App';
import type { Platform } from './platform';

const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';
const SUBTITLE = '쓸모없는 변수, 진짜 쓸모없을까?';
const SCENE = fixtureAppData.scenes[0];

const goto = (hash: string) => window.history.replaceState(null, '', `/${hash}`);
beforeEach(() => goto(''));
afterEach(() => goto(''));

describe('App', () => {
  it('데이터가 없으면 안내 화면을 보여주고 제목·출처는 그대로 둔다', () => {
    render(<App data={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TMI 야구' }).closest('header')).not.toBeNull();
    expect(screen.getByRole('main')).toHaveTextContent('앱 데이터가 없어요. npm run data로 만든 뒤 다시 빌드하세요.');
    expect(screen.getByText(SOURCES).closest('footer')).not.toBeNull();
  });

  it('머리말에 제목과 내비(장면·판정소·만든 이유), 첫 화면에 부제, 푸터에 출처를 둔다', () => {
    render(<App data={fixtureAppData} />);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('heading', { level: 1, name: 'TMI 야구' })).toBeInTheDocument();
    const nav = within(header).getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('link', { name: '장면' })).toHaveAttribute('href', '#/');
    expect(within(nav).getByRole('link', { name: '판정소' })).toHaveAttribute('href', '#/evidence');
    expect(within(nav).getByRole('link', { name: '만든 이유' })).toHaveAttribute('href', '#/about');
    expect(within(nav).getByRole('link', { name: '장면' })).toHaveAttribute('aria-current', 'page');
    expect(within(screen.getByRole('main')).getByText(SUBTITLE)).toBeInTheDocument();
    expect(screen.getByText(SOURCES).closest('footer')).not.toBeNull();
  });

  it('해시에 따라 화면이 바뀌고 내비에 지금 화면을 표시한다', async () => {
    goto('#/about');
    render(<App data={fixtureAppData} />);
    expect(screen.getByRole('heading', { level: 2, name: '만든 이유' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '만든 이유' })).toHaveAttribute('aria-current', 'page');
    act(() => {
      window.location.hash = '#/evidence';
    });
    expect(await screen.findByRole('heading', { level: 2, name: '판정소' })).toBeInTheDocument();
    act(() => {
      window.location.hash = '#/';
    });
    expect(await screen.findByText(SUBTITLE)).toBeInTheDocument();
  });

  it('play 해시로 들어오면 그 장면을 연다', async () => {
    goto('#/scene/fixture-walkoff');
    render(<App data={fixtureAppData} />);
    expect(await screen.findByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
  });

  it('첫 화면에서 장면 카드를 누르면 그 장면 화면으로 간다', async () => {
    render(<App data={fixtureAppData} />);
    const all = screen.getByRole('region', { name: '모든 장면' });
    act(() => {
      within(all).getAllByRole('link')[0].click();
    });
    expect(await screen.findByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/scene/fixture-walkoff');
  });

  it('모르는 장면이나 열린 장면이 없는 결과 해시는 첫 화면으로 보낸다', async () => {
    goto('#/scene/nope');
    const first = render(<App data={fixtureAppData} />);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();
    first.unmount();

    goto('#/result');
    render(<App data={fixtureAppData} />);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();
  });

  it('플랫폼을 알아내는 동안에도 첫 화면을 그리고, 준비되면 그 플랫폼을 쓴다', async () => {
    const second: SceneRecord = { ...SCENE, id: 'fixture-second', title: '두 번째 픽스처 장면', date: '2026-08-20' };
    const data: AppData = { ...fixtureAppData, scenes: [SCENE, second] };
    let resolvePlatform: (platform: Platform) => void = () => undefined;
    const platformPromise = new Promise<Platform>((resolve) => {
      resolvePlatform = resolve;
    });
    render(<App data={data} platformPromise={platformPromise} />);
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();

    // todaySceneIndex('2026-01-02', 2) = 1
    await act(async () => {
      resolvePlatform(fakePlatform({ today: () => '2026-01-02' }));
      await platformPromise;
    });
    const today = screen.getByRole('region', { name: '오늘의 장면' });
    expect(within(today).getByText('두 번째 픽스처 장면')).toBeInTheDocument();
  });
});
