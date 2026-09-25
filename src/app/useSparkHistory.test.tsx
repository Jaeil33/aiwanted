import { act } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { GaugeLike } from '../game';
import type { SparkPoint } from '../game/broadcast';
import { FIXTURE_FINAL, fixtureSituation } from '../test/fixtures/appData';
import { renderWithGame } from '../test/gameHarness';
import { useSparkHistory } from './useSparkHistory';

const g = (winHome: number): GaugeLike => ({ batterWin: 0.4, inningScore: 0.3, expRuns: 0.8, winHome, tie: 0.1, winAway: 0.9 - winHome });

type Input = { gauge: GaugeLike | null; pending: boolean };

function setup() {
  const box: { points: SparkPoint[]; set: (input: Input) => void } = { points: [], set: () => undefined };
  function Probe() {
    const [input, setInput] = useState<Input>({ gauge: null, pending: false });
    box.set = setInput;
    box.points = useSparkHistory(input.gauge, input.pending);
    return null;
  }
  const view = renderWithGame(<Probe />);
  return { view, box };
}

describe('useSparkHistory', () => {
  it('새 게이지마다 한 점(타석 번호·반이닝), 같은 게이지·계산 중에는 찍지 않는다', async () => {
    const { view, box } = setup();
    await act(async () => {
      await view.game().actions.openSituation(fixtureSituation, { actualFinal: { ...FIXTURE_FINAL } }, null);
    });
    const first = g(0.6);
    act(() => box.set({ gauge: first, pending: false }));
    expect(box.points).toEqual([{ paIndex: 0, inning: 9, half: 1, tmi: first }]);
    act(() => box.set({ gauge: first, pending: false }));
    expect(box.points).toHaveLength(1);
    const second = g(0.65);
    act(() => box.set({ gauge: second, pending: true }));
    expect(box.points).toHaveLength(1);
    act(() => box.set({ gauge: second, pending: false }));
    expect(box.points.map((p) => p.tmi.winHome)).toEqual([0.6, 0.65]);
  });

  it('처음부터 다시 하면(판 seed가 바뀌면) 지난 판의 점을 버리고 지금 게이지부터 다시 쌓는다', async () => {
    const { view, box } = setup();
    await act(async () => {
      await view.game().actions.openSituation(fixtureSituation, { actualFinal: { ...FIXTURE_FINAL } }, null);
    });
    act(() => box.set({ gauge: g(0.6), pending: false }));
    act(() => box.set({ gauge: g(0.62), pending: false }));
    expect(box.points).toHaveLength(2);
    act(() => view.game().actions.resetPlay());
    expect(box.points.map((p) => p.tmi.winHome)).toEqual([0.62]);
    act(() => box.set({ gauge: g(0.61), pending: false }));
    expect(box.points.map((p) => p.tmi.winHome)).toEqual([0.62, 0.61]);
  });
});
