import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PitchPlayback, StageController } from '../../stage';
import { fixtureAppData } from '../../test/fixtures/appData';
import { renderWithGame } from '../../test/gameHarness';
import { PlayScreen } from './PlayScreen';

/** jsdom 캔버스 대신 가짜 경기장: 컨트롤러 호출만 기록하고 연출은 곧바로 끝낸다 */
const stageMock = vi.hoisted(() => ({ played: [] as PitchPlayback[] }));

vi.mock('../../stage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stage')>();
  const react = await import('react');
  const controller: StageController = {
    setScene: () => undefined,
    setBases: () => undefined,
    setBoard: () => undefined,
    playPitch: async (p) => {
      stageMock.played.push(p);
    },
    showBanner: async () => undefined,
    clearMarkers: () => undefined,
    resize: () => undefined,
    inspect: () => ({ busy: false, bases: 0, board: ['', ''], banner: null, markers: 0, scene: null }),
    destroy: () => undefined,
  };
  const FakeStage = react.forwardRef<StageController, Record<string, unknown>>(function FakeStage(_props, ref) {
    react.useImperativeHandle(ref, () => controller, []);
    return react.createElement('div', { 'data-testid': 'ballpark' });
  });
  return { ...actual, BallparkStage: FakeStage };
});

const SLOW = { timeout: 30_000 };
const SCENE = fixtureAppData.scenes[0];
const START_SENTENCE = '9회말 2아웃, 주자 만루, 볼 0 스트라이크 0, KIA 4 대 롯데 4';

async function openPlay() {
  const view = renderWithGame(<PlayScreen />);
  await act(async () => {
    await view.game().actions.openScene(SCENE.id, null);
  });
  return view;
}

beforeEach(() => {
  stageMock.played.length = 0;
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

  it('장면 머리·경기장·스코어버그·3단 승률·모드·TMI 입력·기록·차트·조작을 그리고 실제 결과는 숨긴다', SLOW, async () => {
    await openPlay();
    expect(screen.getByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
    expect(screen.getByText('8월 15일 · 픽스처 구장')).toBeInTheDocument();
    expect(screen.getByText('실제 결과는 경기가 끝나면 공개돼요')).toBeInTheDocument();
    expect(screen.getByTestId('ballpark')).toBeInTheDocument();
    expect(screen.getByText(START_SENTENCE)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '타석 승부' }, { timeout: 20_000 })).toBeInTheDocument();
    expect(screen.getByText('홈타자6 출루')).toBeInTheDocument();
    expect(screen.getByText('현실 모드', { selector: '[data-mode]' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '현실 모드' })).toBeChecked();
    expect(screen.getByLabelText('TMI 한 줄')).toBeEnabled();
    expect(screen.getByRole('button', { name: '원정투수가 경기 전 짜장면 곱빼기를 먹었다' })).toBeInTheDocument();
    // josa는 한글이 아닌 끝 글자(6)에 받침 없는 조사를 붙인다
    expect(screen.getByRole('button', { name: '홈타자6가 새 배트를 들고 나왔다' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오늘 기온 35도, 폭염' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '원정팀이 버스로 5시간 이동했다' })).toBeInTheDocument();
    expect(screen.getByText('아직 던진 공이 없어요')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /^롯데 승리확률 \d/ }, { timeout: 20_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한 구 던지기' })).toBeEnabled();
    expect(screen.queryByText(SCENE.actual.result)).toBeNull();
  });

  it('"오늘 폭염" TMI를 걸면 해석 카드와 변화 칩이 보인다', SLOW, async () => {
    const user = userEvent.setup();
    await openPlay();
    await user.type(screen.getByLabelText('TMI 한 줄'), '오늘 폭염');
    await user.click(screen.getByRole('button', { name: 'TMI 걸기' }));
    const card = await screen.findByRole('article', { name: 'TMI 오늘 폭염' });
    expect(within(card).getByText('규칙 해석')).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: '해석 결과' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '진짜야?' })).toBeInTheDocument();
    await waitFor(
      () => {
        const deltas = screen.getAllByText(/%p$/).map((el) => el.textContent);
        expect(deltas.some((text) => text !== '±0.00%p')).toBe(true);
      },
      { timeout: 20_000 },
    );
    expect(within(screen.getByRole('list', { name: '근거 등급' })).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('"한 구 던지기"를 누르면 공을 연출하고 스코어버그나 기록이 바뀌며 TMI 편집이 잠긴다', SLOW, async () => {
    const user = userEvent.setup();
    await openPlay();
    await user.click(screen.getByRole('button', { name: '한 구 던지기' }));
    await waitFor(() => expect(stageMock.played).toHaveLength(1), { timeout: 20_000 });
    await waitFor(() => {
      const countChanged = screen.queryByText(START_SENTENCE) === null;
      const logged = screen.queryByText('아직 던진 공이 없어요') === null;
      expect(countChanged || logged).toBe(true);
    });
    expect(await screen.findByText('처음부터 다시 하면 TMI를 바꿀 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '만화 모드' })).toBeDisabled();
  });

  it('경기가 끝나면 결과 해시로 보낸다', async () => {
    const view = await openPlay();
    act(() => {
      view.game().dispatch({ type: 'gameFinished', winner: 'home', walkoff: true, state: SCENE.state });
    });
    await waitFor(() => expect(window.location.hash).toBe('#/result'));
  });
});
