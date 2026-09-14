import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LedMeter } from './LedMeter';
import styles from './LedMeter.module.css';

const lit = (container: HTMLElement) => container.querySelectorAll('[data-cell][data-on="true"]').length;
const cells = (container: HTMLElement) => container.querySelectorAll('[data-cell]').length;

describe('LedMeter', () => {
  it('role="meter"에 이름·aria-valuemin/max/now·aria-valuetext를 단다', () => {
    const { container } = render(<LedMeter label="승부처 지수" value={38.6} max={100} valueText="38.6%p" />);
    const meter = screen.getByRole('meter', { name: '승부처 지수' });
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-valuenow', '38.6');
    expect(meter).toHaveAttribute('aria-valuetext', '38.6%p');
    expect(meter).toHaveClass(styles.meter);
    expect(container.querySelector(`.${styles.value}`)).toHaveTextContent('38.6%p');
    expect(container.querySelector(`.${styles.label}`)).toHaveTextContent('승부처 지수');
  });

  it('기본 20칸, 켜진 칸 수 = round(value / max × segments)', () => {
    const { container, rerender } = render(<LedMeter label="승부처 지수" value={38.6} max={100} valueText="38.6" />);
    expect(cells(container)).toBe(20);
    expect(lit(container)).toBe(8); // 7.72 → 8
    rerender(<LedMeter label="승부처 지수" value={2.4} max={100} valueText="2.4" />);
    expect(lit(container)).toBe(0); // 0.48 → 0
    rerender(<LedMeter label="승부처 지수" value={2.5} max={100} valueText="2.5" />);
    expect(lit(container)).toBe(1); // 0.5 → 1
  });

  it('경계: 0이면 0칸, max를 넘으면 모든 칸(aria-valuenow는 max로 자름), 음수는 0칸', () => {
    const { container, rerender } = render(<LedMeter label="승부처 지수" value={0} max={100} valueText="0" />);
    expect(lit(container)).toBe(0);
    rerender(<LedMeter label="승부처 지수" value={150} max={100} valueText="150" />);
    expect(lit(container)).toBe(20);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    rerender(<LedMeter label="승부처 지수" value={-5} max={100} valueText="-5" />);
    expect(lit(container)).toBe(0);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('segments로 칸 수를 바꾸고, max가 0 이하이거나 값이 숫자가 아니면 모두 끈다', () => {
    const { container, rerender } = render(<LedMeter label="긴장도" value={5} max={10} segments={10} valueText="5" />);
    expect(cells(container)).toBe(10);
    expect(lit(container)).toBe(5);
    rerender(<LedMeter label="긴장도" value={5} max={0} segments={10} valueText="5" />);
    expect(lit(container)).toBe(0);
    rerender(<LedMeter label="긴장도" value={Number.NaN} max={10} segments={10} valueText="—" />);
    expect(lit(container)).toBe(0);
  });
});
