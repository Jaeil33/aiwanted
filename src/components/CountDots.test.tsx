import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountDots } from './CountDots';
import styles from './CountDots.module.css';

const dots = (container: HTMLElement, kind: 'ball' | 'strike' | 'out') =>
  [...container.querySelectorAll(`[data-dot="${kind}"]`)].map((dot) => dot.getAttribute('data-on'));

describe('CountDots', () => {
  it('B 3점·S 2점·O 2점 중 개수만큼 켠다', () => {
    const { container } = render(<CountDots balls={2} strikes={1} outs={1} />);
    expect(dots(container, 'ball')).toEqual(['true', 'true', 'false']);
    expect(dots(container, 'strike')).toEqual(['true', 'false']);
    expect(dots(container, 'out')).toEqual(['true', 'false']);
    expect(container.querySelector('[data-dot="ball"]')).toHaveClass(styles.dot);
  });

  it('0이면 모두 끄고, 한도를 넘으면 모두 켜고, 음수는 0으로 본다', () => {
    const { container, rerender } = render(<CountDots balls={0} strikes={0} outs={0} />);
    expect([...dots(container, 'ball'), ...dots(container, 'strike'), ...dots(container, 'out')].every((on) => on === 'false')).toBe(true);
    rerender(<CountDots balls={4} strikes={3} outs={3} />);
    expect([...dots(container, 'ball'), ...dots(container, 'strike'), ...dots(container, 'out')].every((on) => on === 'true')).toBe(true);
    rerender(<CountDots balls={-1} strikes={-2} outs={-3} />);
    expect([...dots(container, 'ball'), ...dots(container, 'strike'), ...dots(container, 'out')].every((on) => on === 'false')).toBe(true);
  });

  it('B·S·O 글자를 두고, 한 문장 aria-label로 읽는다', () => {
    const { container } = render(<CountDots balls={3} strikes={2} outs={2} />);
    const count = screen.getByRole('img', { name: '볼 3, 스트라이크 2, 아웃 2' });
    expect(count).toHaveClass(styles.count);
    expect([...container.querySelectorAll('[data-letter]')].map((letter) => letter.textContent)).toEqual(['B', 'S', 'O']);
  });
});
