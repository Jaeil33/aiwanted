import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TmiRail, type TmiInvite } from './TmiRail';

const PILLS = [
  { id: 'tmi-1', text: '짜장면 곱빼기', effect: '투수 체력 ↓', tone: 'fun' as const, deltaPp: 0.44 },
  { id: 'tmi-2', text: '오늘 폭염', effect: '기온 32°C', tone: 'measured' as const, deltaPp: null },
];

function invite(over: Partial<TmiInvite> = {}): TmiInvite {
  return {
    onOpen: vi.fn(),
    onQuick: vi.fn(),
    busy: false,
    quick: [
      { label: '짜장면 곱빼기', text: '박투수가 경기 전 짜장면 곱빼기를 먹었다' },
      { label: '3시간 잠', text: '김타자가 어젯밤 3시간밖에 못 잤다' },
    ],
    ...over,
  };
}

describe('TmiRail', () => {
  it('걸린 TMI마다 문장·효과·경기 승률 변화를 칩으로, 맨 앞에 노란 행동 칩을 둔다', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(<TmiRail pills={PILLS} onOpen={onOpen} action={{ label: '+ TMI 걸기', onClick: onAction }} />);
    const rail = screen.getByRole('region', { name: '걸린 TMI' });
    const first = within(rail).getByRole('button', { name: 'TMI 짜장면 곱빼기, 투수 체력 ↓, +0.44%p' });
    expect(first).toHaveAttribute('data-tone', 'fun');
    expect(within(first).getByText('+0.44%p')).toHaveAttribute('data-trend', 'up');
    expect(within(rail).getByRole('button', { name: 'TMI 오늘 폭염, 기온 32°C, 계산 중' })).toBeInTheDocument();
    await user.click(first);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const add = within(rail).getByRole('button', { name: '+ TMI 걸기' });
    expect(add).toHaveAttribute('data-accent', 'true');
    // 칩이 길어져도 가로로 넘기지 않고 보이게 맨 앞
    expect(within(rail).getAllByRole('button')[0]).toBe(add);
    await user.click(add);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('짧은 글이 있으면 칩에는 짧은 글, 이름에는 원문', () => {
    render(<TmiRail pills={[{ ...PILLS[0], text: '박투수가 경기 전 짜장면 곱빼기를 먹었다', short: '경기 전 짜장면 곱빼기를 먹었다' }]} onOpen={() => undefined} action={null} />);
    const pill = screen.getByRole('button', { name: /^TMI 박투수가 경기 전 짜장면 곱빼기를 먹었다, / });
    expect(within(pill).getByText('경기 전 짜장면 곱빼기를 먹었다')).toBeInTheDocument();
  });

  it('행동 칩이 없으면 TMI 칩만', () => {
    render(<TmiRail pills={PILLS.slice(0, 1)} onOpen={() => undefined} action={null} />);
    expect(within(screen.getByRole('region', { name: '걸린 TMI' })).getAllByRole('button')).toHaveLength(1);
  });

  it('걸린 TMI가 없고 초대가 있으면 큰 "TMI 걸기" 판과 바로 거는 예시를 보인다', async () => {
    const user = userEvent.setup();
    const inv = invite();
    render(<TmiRail pills={[]} onOpen={() => undefined} action={{ label: '+ TMI 걸기', onClick: vi.fn() }} invite={inv} />);
    const rail = screen.getByRole('region', { name: '걸린 TMI' });
    const cta = within(rail).getByRole('button', { name: 'TMI 걸기' });
    expect(cta).toHaveTextContent('방금 이 타석에 TMI 걸기');
    expect(cta).toHaveTextContent('아무 말이나 쓰면 확률이 바뀌어요');
    expect(within(rail).queryByRole('button', { name: '+ TMI 걸기' })).toBeNull();
    await user.click(cta);
    expect(inv.onOpen).toHaveBeenCalledTimes(1);
    const quick = within(rail).getByRole('group', { name: '눌러서 바로 걸기' });
    await user.click(within(quick).getByRole('button', { name: '짜장면 곱빼기' }));
    expect(inv.onQuick).toHaveBeenCalledWith('박투수가 경기 전 짜장면 곱빼기를 먹었다');
  });

  it('해석 중이면 바로 거는 예시를 잠근다', () => {
    render(<TmiRail pills={[]} onOpen={() => undefined} action={null} invite={invite({ busy: true })} />);
    for (const button of within(screen.getByRole('group', { name: '눌러서 바로 걸기' })).getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('걸린 TMI가 있으면 초대 대신 칩 줄을 보인다', () => {
    render(<TmiRail pills={PILLS} onOpen={() => undefined} action={null} invite={invite()} />);
    expect(screen.queryByRole('group', { name: '눌러서 바로 걸기' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'TMI 걸기' })).toBeNull();
  });
});
