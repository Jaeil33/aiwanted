import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureAppData } from '../../test/fixtures/appData';
import { fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { Platform } from '../platform';
import { PaScreen } from './PaScreen';

const SLOW = { timeout: 120_000 };
const WAIT = { timeout: 90_000 };
const SCENE = fixtureAppData.scenes[0]; // 9회말 2사 만루, 홈타자6 vs 원정투수, 실제: 만루 홈런

async function openPa(platform: Platform = fakePlatform()) {
  const view = renderWithGame(<PaScreen />, { platform });
  await act(async () => {
    await view.game().actions.openScene(SCENE.id, null);
  });
  return view;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/scene/fixture-walkoff');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('PaScreen', () => {
  it('장면을 열기 전에는 여는 중이라는 제목만 보여준다', () => {
    renderWithGame(<PaScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '타석을 여는 중…' })).toBeInTheDocument();
  });

  it('스코어버그·자막·실제 결과·확률 판(실제 결과 사건)·승리확률 한 줄·도크를 그린다', SLOW, async () => {
    await openPa();
    expect(screen.getByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
    const bug = screen.getByRole('group', { name: '스코어버그' });
    expect(within(bug).getByText('KIA')).toBeInTheDocument();
    expect(within(bug).getByText('롯데')).toBeInTheDocument();
    expect(within(bug).getByLabelText('9회말')).toBeInTheDocument();
    expect(screen.getByText('홈타자6')).toBeInTheDocument();
    expect(screen.getByText('원정투수')).toBeInTheDocument();
    expect(screen.getByText('실제: 우익수 뒤 만루 홈런')).toBeInTheDocument();
    expect(await screen.findByLabelText(/^홈타자6 홈런 확률 \d+\.\d%$/, undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/^롯데 승리확률 \d+\.\d%$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TMI 걸기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '실제 투구 보기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '한 타석 쳐보기' })).toBeEnabled();
  });

  it('TMI를 걸면 카드가 생기고, 확률 판에 TMI 없음 값·변화가 보이고, 걸린 TMI 알약이 생긴다', SLOW, async () => {
    const user = userEvent.setup();
    await openPa();
    await user.click(screen.getByRole('button', { name: 'TMI 걸기' }));
    const dialog = screen.getByRole('dialog', { name: 'TMI 걸기' });
    await user.type(within(dialog).getByLabelText('TMI 한 줄'), '투수가 어젯밤 3시간밖에 못 잤다');
    await user.click(within(dialog).getByRole('button', { name: '걸기' }));
    expect(await screen.findByRole('article', { name: 'TMI 투수가 어젯밤 3시간밖에 못 잤다' }, WAIT)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.getByText(/^TMI 없이 \d+\.\d%$/)).toBeInTheDocument(), WAIT);
    expect(screen.getByRole('button', { name: 'TMI 투수가 어젯밤 3시간밖에 못 잤다 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TMI 추가' })).toBeInTheDocument();
  });

  it('"한 타석 쳐보기"를 누르면 타석이 끝나고 결과 카드가 열리며, "같은 TMI로 다시"로 처음으로 돌아간다', SLOW, async () => {
    const user = userEvent.setup();
    const view = await openPa();
    await user.click(screen.getByRole('button', { name: '한 타석 쳐보기' }));
    const dialog = await screen.findByRole('dialog', undefined, WAIT);
    expect(within(dialog).getByText('한 타석 쳐본 결과')).toBeInTheDocument();
    expect(view.game().session.log).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: '같은 TMI로 다시' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(view.game().session.log).toHaveLength(0);
    expect(screen.getByRole('button', { name: '한 타석 쳐보기' })).toBeEnabled();
  });

  it('"결과 카드 공유"는 이 타석 링크를 플랫폼 공유로 보내고 안내를 보여준다', SLOW, async () => {
    const user = userEvent.setup();
    const shareLink = vi.fn(async () => 'copied' as const);
    await openPa(fakePlatform({ shareLink }));
    await user.click(screen.getByRole('button', { name: '한 타석 쳐보기' }));
    const dialog = await screen.findByRole('dialog', undefined, WAIT);
    await user.click(within(dialog).getByRole('button', { name: '결과 카드 공유' }));
    expect(await screen.findByText('링크를 복사했어요.')).toBeInTheDocument();
    expect(shareLink).toHaveBeenCalledWith(expect.stringContaining('#/scene/fixture-walkoff'), expect.stringContaining('TMI 야구'));
  });
});
