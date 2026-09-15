import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WinBar } from './WinBar';

describe('WinBar', () => {
  it('왼쪽·무승부·오른쪽 구간을 비율대로 나누고 팀 색을 쓰며, TMI 없음 기준선을 둔다', () => {
    render(<WinBar left={0.58} tie={0.12} right={0.3} ghost={0.576} leftColor="#D6D6D6" rightColor="#86A8EE" label="KT 58.0% · 무승부 12.0% · NC 30.0%" />);
    const bar = screen.getByRole('img', { name: 'KT 58.0% · 무승부 12.0% · NC 30.0%' });
    const [a, t, b] = [...bar.querySelectorAll('i')] as HTMLElement[];
    expect(a.style.flexBasis).toBe('58%');
    expect(t.style.flexBasis).toBe('12%');
    expect(b.style.flexBasis).toBe('30%');
    expect(bar.style.getPropertyValue('--a')).toBe('#D6D6D6');
    expect(bar.style.getPropertyValue('--b')).toBe('#86A8EE');
    const ghost = bar.querySelector('b') as HTMLElement;
    expect(ghost.style.left).toBe('calc(57.6% - 1px)');
  });

  it('무승부가 0이면 가운데 구간을 숨긴다', () => {
    render(<WinBar left={0.4} tie={0} right={0.6} ghost={0.4} leftColor="#fff" rightColor="#000" label="막대" />);
    const [, t] = [...screen.getByRole('img', { name: '막대' }).querySelectorAll('i')] as HTMLElement[];
    expect(t).toHaveAttribute('data-empty', 'true');
  });
});
