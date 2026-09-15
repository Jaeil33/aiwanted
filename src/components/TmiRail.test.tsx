import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TmiRail } from './TmiRail';

const PILLS = [
  { id: 'tmi-1', text: '짜장면 곱빼기', effect: '투수 체력 ↓', tone: 'fun' as const, deltaPp: 0.44 },
  { id: 'tmi-2', text: '오늘 폭염', effect: '기온 32°C', tone: 'measured' as const, deltaPp: null },
];

describe('TmiRail', () => {
  it('걸린 TMI마다 문장·효과·경기 승률 변화를 칩으로, 끝에 행동 칩을 둔다', async () => {
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
    await user.click(within(rail).getByRole('button', { name: '+ TMI 걸기' }));
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
});
