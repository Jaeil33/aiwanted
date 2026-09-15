import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TierReadout } from '../game/broadcast';
import { WpPanel, type WpPanelProps } from './WpPanel';

const READOUT: TierReadout = {
  tier: 'game',
  label: 'KT 승리확률',
  rightLabel: 'NC',
  value: 0.58,
  base: 0.5759,
  deltaPp: 0.41,
  bar: { left: 0.58, tie: 0.121, right: 0.299, ghost: 0.5759, leftColor: '#D6D6D6', rightColor: '#86A8EE' },
  sub: ['무승부 12.1%', 'NC 29.9%'],
};

const props = (over: Partial<WpPanelProps> = {}): WpPanelProps => ({
  readout: READOUT,
  tier: 'game',
  onTier: vi.fn(),
  mode: 'real',
  onMode: vi.fn(),
  modeLocked: false,
  hasTmi: true,
  grade: 'fun',
  spark: [0.5759, 0.58],
  ...over,
});

describe('WpPanel', () => {
  it('경기·이닝·타석 탭과 현실·만화 ×6 모드, 라벨·큰 숫자·TMI 변화·등급·막대·보조 줄을 그린다', () => {
    render(<WpPanel {...props()} />);
    const panel = screen.getByRole('region', { name: '승부 확률' });
    const tabs = within(within(panel).getByRole('tablist', { name: '확률 단위' })).getAllByRole('tab');
    expect(tabs.map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
      ['경기', 'true'],
      ['이닝', 'false'],
      ['타석', 'false'],
    ]);
    const radios = within(within(panel).getByRole('radiogroup', { name: '모드' })).getAllByRole('radio');
    expect(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['현실', 'true'],
      ['만화 ×6', 'false'],
    ]);
    expect(within(panel).getByText('KT 승리확률')).toBeInTheDocument();
    expect(within(panel).getByLabelText('KT 승리확률 58.0%')).toHaveTextContent('58.0%');
    expect(within(panel).getByText('+0.41%p')).toBeInTheDocument();
    expect(within(panel).getByText('상상')).toBeInTheDocument();
    expect(within(panel).getByRole('img', { name: 'KT 승리확률 58.0% · 무승부 12.1% · NC 29.9%' })).toBeInTheDocument();
    expect(within(panel).getByText('57.6%')).toBeInTheDocument();
    expect(panel).toHaveTextContent('TMI 없이 57.6% · 무승부 12.1% · NC 29.9% · 현실 모드');
  });

  it('탭과 모드를 누르면 알린다. 모드가 잠기면 누를 수 없다', async () => {
    const user = userEvent.setup();
    const p = props();
    const view = render(<WpPanel {...p} />);
    await user.click(screen.getByRole('tab', { name: '이닝' }));
    expect(p.onTier).toHaveBeenCalledWith('inning');
    await user.click(screen.getByRole('radio', { name: '만화 ×6' }));
    expect(p.onMode).toHaveBeenCalledWith('toon');
    view.rerender(<WpPanel {...p} modeLocked />);
    expect(screen.getByRole('radio', { name: '만화 ×6' })).toBeDisabled();
  });

  it('만화 모드면 보조 줄에 과장 배수를 밝힌다', () => {
    render(<WpPanel {...props({ mode: 'toon' })} />);
    expect(screen.getByRole('region', { name: '승부 확률' })).toHaveTextContent('만화 모드 · 효과 6배 과장');
  });

  it('TMI가 없으면 변화·등급·"TMI 없이" 없이 값만', () => {
    render(<WpPanel {...props({ hasTmi: false, grade: null })} />);
    const panel = screen.getByRole('region', { name: '승부 확률' });
    expect(within(panel).queryByText('+0.41%p')).toBeNull();
    expect(within(panel).queryByText('상상')).toBeNull();
    expect(panel).not.toHaveTextContent('TMI 없이');
    expect(panel).toHaveTextContent('무승부 12.1% · NC 29.9% · 현실 모드');
  });

  it('값이 아직 없으면 계산 중', () => {
    render(<WpPanel {...props({ readout: null })} />);
    expect(screen.getByRole('region', { name: '승부 확률' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('계산 중…')).toBeInTheDocument();
  });
});
