import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoilFrame } from './FoilFrame';
import styles from './FoilFrame.module.css';

const frameOf = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('FoilFrame', () => {
  it('근거 등급마다 금속 테두리 클래스와 이 요소의 --foil 변수(금·은·구리)를 둔다', () => {
    const cases = [
      ['measured', 'var(--foil-real)'],
      ['plausible', 'var(--foil-maybe)'],
      ['fun', 'var(--foil-fun)'],
    ] as const;
    for (const [grade, foil] of cases) {
      const { container, unmount } = render(
        <FoilFrame grade={grade} radius="card">
          <p>짜장면 곱빼기</p>
        </FoilFrame>,
      );
      const frame = frameOf(container);
      expect(frame).toHaveClass(styles.frame, styles.foil, styles[grade]);
      expect(frame).not.toHaveClass(styles.refused);
      expect(frame).toHaveAttribute('data-grade', grade);
      expect(frame.style.getPropertyValue('--foil')).toBe(foil);
      unmount();
    }
  });

  it('refused는 금속 테두리 대신 --out 1px 테두리 클래스이고 --foil을 두지 않는다', () => {
    const { container } = render(
      <FoilFrame grade="refused" radius="card">
        <p>계산하지 않아요</p>
      </FoilFrame>,
    );
    const frame = frameOf(container);
    expect(frame).toHaveClass(styles.frame, styles.refused);
    expect(frame).not.toHaveClass(styles.foil);
    expect(frame).toHaveAttribute('data-grade', 'refused');
    expect(frame.style.getPropertyValue('--foil')).toBe('');
  });

  it('radius(slot 8px·ticket 10px·card 12px) 클래스를 달고 className을 덧붙인다', () => {
    for (const radius of ['slot', 'ticket', 'card'] as const) {
      const { container, unmount } = render(
        <FoilFrame grade="measured" radius={radius} className="slot-button">
          <span>기온 35도</span>
        </FoilFrame>,
      );
      const frame = frameOf(container);
      expect(frame).toHaveClass(styles[radius], 'slot-button');
      expect(frame).toHaveAttribute('data-radius', radius);
      unmount();
    }
  });

  it('children을 테두리 안에 그린다', () => {
    const { container } = render(
      <FoilFrame grade="fun" radius="slot">
        <b>투수 체력 ▼</b>
      </FoilFrame>,
    );
    expect(frameOf(container)).toContainElement(screen.getByText('투수 체력 ▼'));
  });
});
