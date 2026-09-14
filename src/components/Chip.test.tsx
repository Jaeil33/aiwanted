import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './Chip';
import styles from './Chip.module.css';

describe('Chip', () => {
  it('mode·toon·plain: kind마다 클래스를 달고 글자를 그대로 보여준다', () => {
    const { rerender } = render(<Chip kind="mode">현실 모드</Chip>);
    expect(screen.getByText('현실 모드')).toHaveClass(styles.chip, styles.mode);
    expect(screen.getByText('현실 모드')).toHaveAttribute('data-kind', 'mode');
    rerender(<Chip kind="toon">만화 모드: 효과 6배 과장</Chip>);
    expect(screen.getByText('만화 모드: 효과 6배 과장')).toHaveClass(styles.chip, styles.toon);
    rerender(<Chip kind="plain">TMI 없음 53.6%</Chip>);
    expect(screen.getByText('TMI 없음 53.6%')).toHaveClass(styles.chip, styles.plain);
    expect(screen.getByText('TMI 없음 53.6%')).not.toHaveClass(styles.toon);
  });

  it('grade: 등급마다 금속색 클래스, refused는 거부 색 클래스', () => {
    const cases = [
      ['measured', '실측'],
      ['plausible', '그럴듯함'],
      ['fun', '상상'],
      ['refused', '계산 안 함'],
    ] as const;
    for (const [grade, label] of cases) {
      const { unmount } = render(
        <Chip kind="grade" grade={grade}>
          {label}
        </Chip>,
      );
      const chip = screen.getByText(label);
      expect(chip).toHaveClass(styles.chip, styles.grade, styles[grade]);
      expect(chip).toHaveAttribute('data-grade', grade);
      unmount();
    }
  });

  it('delta: tone마다 색 클래스(up 유리 --ball, down 불리 --out, flat 변화 없음)', () => {
    const cases = [
      ['up', '+0.4%p'],
      ['down', '−0.07%p'],
      ['flat', '±0.00%p'],
    ] as const;
    for (const [tone, text] of cases) {
      const { unmount } = render(
        <Chip kind="delta" tone={tone}>
          {text}
        </Chip>,
      );
      const chip = screen.getByText(text);
      expect(chip).toHaveClass(styles.chip, styles.delta, styles[tone]);
      expect(chip).toHaveAttribute('data-tone', tone);
      unmount();
    }
  });

  it('delta에 tone이 없으면 flat으로 그리고, delta가 아니면 tone·grade를 달지 않는다', () => {
    const { rerender } = render(<Chip kind="delta">±0.00%p</Chip>);
    expect(screen.getByText('±0.00%p')).toHaveAttribute('data-tone', 'flat');
    rerender(
      <Chip kind="mode" tone="up" grade="fun">
        현실 모드
      </Chip>,
    );
    const chip = screen.getByText('현실 모드');
    expect(chip).not.toHaveAttribute('data-tone');
    expect(chip).not.toHaveAttribute('data-grade');
  });
});
