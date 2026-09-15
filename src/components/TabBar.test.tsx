import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabBar } from './TabBar';
import styles from './TabBar.module.css';

const currents = () => screen.getAllByRole('link').map((link) => link.getAttribute('aria-current'));

describe('TabBar', () => {
  it('주 메뉴 내비에 경기·만든 이유 링크 두 개를 아이콘과 라벨로 둔다(ADR-020)', () => {
    render(<TabBar current="lobby" />);
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(nav).toHaveClass(styles.bar);
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['경기', '#/'],
      ['만든 이유', '#/about'],
    ]);
    expect(links.map((link) => link.querySelector('svg')?.getAttribute('data-icon'))).toEqual(['ball', 'scale']);
    expect(links.every((link) => link.querySelector('svg')?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(links.every((link) => link.classList.contains(styles.link))).toBe(true);
  });

  it('지금 탭만 aria-current="page"이고, null이면 아무 탭도 표시하지 않는다', () => {
    const { rerender } = render(<TabBar current="lobby" />);
    expect(currents()).toEqual(['page', null]);
    rerender(<TabBar current="about" />);
    expect(currents()).toEqual([null, 'page']);
    rerender(<TabBar current={null} />);
    expect(currents()).toEqual([null, null]);
  });
});
