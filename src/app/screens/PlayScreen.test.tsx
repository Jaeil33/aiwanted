import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import controls from '../../components/controls.module.css';
import { FIXTURE_FINAL, FIXTURE_TITLE, fixtureSituation } from '../../test/fixtures/appData';
import { renderWithGame } from '../../test/gameHarness';
import { PlayScreen } from './PlayScreen';

const SLOW = { timeout: 120_000 };
const WAIT = { timeout: 90_000 };
const SCENE = fixtureSituation; // 9회말 2사 만루 4:4, 홈 롯데 공격, 홈타자6 vs 원정투수

async function openPlay() {
  const view = renderWithGame(<PlayScreen />);
  await act(async () => {
    await view.game().actions.openSituation(fixtureSituation, { actualFinal: { ...FIXTURE_FINAL } }, null);
  });
  return view;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/scene/fixture-walkoff');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('PlayScreen', () => {
  it('장면을 열기 전에는 여는 중이라는 제목만 보여준다', () => {
    renderWithGame(<PlayScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '장면을 여는 중…' })).toBeInTheDocument();
  });

  it('스코어버그·트래커 자막·승부 확률 판(경기 탭)·TMI 줄·세 버튼 도크를 그리고 실제 결과는 숨긴다', SLOW, async () => {
    await openPlay();
    expect(screen.getByRole('heading', { level: 2, name: FIXTURE_TITLE })).toBeInTheDocument();
    const bug = screen.getByRole('group', { name: '스코어버그' });
    expect(within(bug).getByLabelText('9회말')).toBeInTheDocument();
    expect(within(bug).getByLabelText('0볼 0스트라이크')).toBeInTheDocument();
    expect(screen.getByText('홈타자6')).toBeInTheDocument();
    expect(screen.getByText('원정투수')).toBeInTheDocument();
    expect(await screen.findByLabelText(/^롯데 승리확률 \d+\.\d%$/, undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '경기' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: '현실' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: /^롯데 승리확률 \d+\.\d% · 무승부 \d+\.\d% · KIA \d+\.\d%$/ })).toBeInTheDocument();
    const invite = screen.getByRole('region', { name: '걸린 TMI' });
    expect(within(invite).getByRole('button', { name: 'TMI 걸기' })).toBeEnabled();
    expect(within(invite).getByRole('group', { name: '눌러서 바로 걸기' })).toBeInTheDocument();
    const dock = screen.getByRole('navigation', { name: '다시 치르기' });
    expect(within(dock).getAllByRole('button').map((b) => b.textContent)).toEqual(['타석 끝까지', '한 구 던지기', '경기 끝까지']);
    expect(screen.queryByText(/^실제/)).toBeNull();
    expect(screen.queryByText(SCENE.actual!.result)).toBeNull();
  });

  it('탭을 바꾸면 이닝 득점확률·타석 출루확률로 바뀐다', SLOW, async () => {
    const user = userEvent.setup();
    await openPlay();
    await screen.findByLabelText(/^롯데 승리확률 \d+\.\d%$/, undefined, WAIT);
    await user.click(screen.getByRole('tab', { name: '이닝' }));
    expect(screen.getByLabelText(/^롯데 이번 이닝 득점확률 \d+\.\d%$/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '타석' }));
    expect(screen.getByLabelText(/^홈타자6 출루확률 \d+\.\d%$/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '승부 확률' })).toHaveTextContent(/원정투수 아웃 \d+\.\d%/);
  });

  it('TMI를 걸면 카드가 생기고, 시트를 닫으면 TMI 칩·변화·등급이 판에 보인다', SLOW, async () => {
    const user = userEvent.setup();
    await openPlay();
    await screen.findByLabelText(/^롯데 승리확률 \d+\.\d%$/, undefined, WAIT);
    await user.click(screen.getByRole('button', { name: 'TMI 걸기' }));
    const dialog = screen.getByRole('dialog', { name: 'TMI 걸기' });
    expect(within(dialog).getByLabelText('TMI 한 줄')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('TMI 한 줄'), '투수가 어젯밤 3시간밖에 못 잤다');
    await user.click(within(dialog).getByRole('button', { name: '걸기' }));
    expect(await screen.findByRole('article', { name: 'TMI 투수가 어젯밤 3시간밖에 못 잤다' }, WAIT)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
    const rail = screen.getByRole('region', { name: '걸린 TMI' });
    expect(within(rail).getByRole('button', { name: /^TMI 투수가 어젯밤 3시간밖에 못 잤다, 투수 체력 ↓, / })).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: '승부 확률' });
    await waitFor(() => expect(panel).toHaveTextContent(/TMI 없이 \d+\.\d%/), WAIT);
    expect(within(panel).getByText('그럴듯함')).toBeInTheDocument();
  });

  it('바로 걸기 칩을 누르면 시트 없이 TMI가 걸리고, 초대 판이 칩 줄과 노란 "+ TMI 걸기"로 바뀐다', SLOW, async () => {
    const user = userEvent.setup();
    await openPlay();
    await screen.findByLabelText(/^롯데 승리확률 \d+\.\d%$/, undefined, WAIT);
    await user.click(within(screen.getByRole('group', { name: '눌러서 바로 걸기' })).getByRole('button', { name: '짜장면 곱빼기' }));
    expect(await screen.findByRole('button', { name: /^TMI 원정투수가 경기 전 짜장면 곱빼기를 먹었다, 투수 체력 ↓, / }, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const rail = screen.getByRole('region', { name: '걸린 TMI' });
    expect(within(rail).getByRole('button', { name: '+ TMI 걸기' })).toHaveAttribute('data-accent', 'true');
  });

  it('TMI를 걸기 전에는 초대 판이 승부 확률보다 위에 있고, 걸고 나면 칩 줄이 확률 아래로 내려간다', SLOW, async () => {
    const user = userEvent.setup();
    await openPlay();
    await screen.findByLabelText(/^롯데 승리확률 \d+\.\d%$/, undefined, WAIT);

    // ADR-026: TMI가 먼저 보이게. 초대 판은 타자·투수 바로 아래(확률 판 위)에 온다.
    const invite = screen.getByRole('region', { name: '걸린 TMI' });
    const wp = screen.getByRole('region', { name: '승부 확률' });
    expect(invite.compareDocumentPosition(wp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(screen.getByRole('group', { name: '눌러서 바로 걸기' })).getByRole('button', { name: '짜장면 곱빼기' }));
    await screen.findByRole('button', { name: /^TMI 원정투수가 경기 전 짜장면 곱빼기를 먹었다/ }, WAIT);

    // 걸고 나면 시안 자리(확률 아래)로 돌아간다.
    const rail = screen.getByRole('region', { name: '걸린 TMI' });
    const wpAfter = screen.getByRole('region', { name: '승부 확률' });
    expect(wpAfter.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: '한 구 던지기' })).toHaveClass(controls.primary);
  });

  it('"한 구 던지기" 뒤에는 모드·TMI가 잠기고 "↺ 처음부터"로 되돌린다', SLOW, async () => {
    const user = userEvent.setup();
    const view = await openPlay();
    await screen.findByLabelText(/^롯데 승리확률 \d+\.\d%$/, undefined, WAIT);
    await user.click(screen.getByRole('button', { name: '한 구 던지기' }));
    await waitFor(() => {
      const s = view.game().session;
      expect((s.live?.pitches.length ?? 0) + s.log.length).toBeGreaterThan(0);
      expect(s.status).not.toBe('animating');
    }, WAIT);
    expect(screen.getByRole('radio', { name: '만화 ×6' })).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: '↺ 처음부터' }, WAIT));
    await waitFor(() => expect(view.game().session.log).toHaveLength(0));
    expect(view.game().session.live?.pitches).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'TMI 걸기' })).toBeInTheDocument();
  });

  it('타석이 끝나면 이어가기 줄이 뜨고 TMI를 다시 걸 수 있다', SLOW, async () => {
    // ADR-033·Q13: 한 타석에 개입한 뒤에도 이어서 치거나 여기서 멈출 수 있다
    const view = await openPlay();
    act(() => {
      view.game().dispatch({
        type: 'paFinished',
        entry: {
          index: 0, inning: 9, half: 1, batterName: '홈타자6', pitcherName: '원정투수',
          headline: '삼진', score: { away: 4, home: 4 }, wpHomeAfter: null, highlight: false,
        },
        state: { ...SCENE.state, outs: 3 },
      });
    });
    const bar = await screen.findByRole('group', { name: '이어가기' }, WAIT);
    expect(within(bar).getByText('홈타자6 삼진')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: '처음부터' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: '여기까지' })).toBeInTheDocument();
    // 모드는 잠기고 TMI는 다시 걸 수 있다
    expect(screen.getByRole('radio', { name: '만화 ×6' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'TMI 걸기' })).toBeInTheDocument();
  });

  it('"여기까지"를 누르면 멈춘 판으로 결과 화면에 간다', SLOW, async () => {
    const user = userEvent.setup();
    const view = await openPlay();
    act(() => {
      view.game().dispatch({
        type: 'paFinished',
        entry: {
          index: 0, inning: 9, half: 1, batterName: '홈타자6', pitcherName: '원정투수',
          headline: '삼진', score: { away: 4, home: 4 }, wpHomeAfter: null, highlight: false,
        },
        state: { ...SCENE.state, outs: 3 },
      });
    });
    await user.click(await screen.findByRole('button', { name: '여기까지' }, WAIT));
    await waitFor(() => expect(window.location.hash).toBe('#/result'));
    expect(view.game().session.final).toMatchObject({ stopped: true });
  });

  it('경기가 끝나면 마지막 콜을 잠깐 보여준 뒤 결과 해시로 보낸다', async () => {
    const view = await openPlay();
    act(() => {
      view.game().dispatch({ type: 'gameFinished', winner: 'home', walkoff: true, state: SCENE.state });
    });
    expect(window.location.hash).toBe('#/scene/fixture-walkoff');
    await waitFor(() => expect(window.location.hash).toBe('#/result'), { timeout: 5_000 });
  });
});
