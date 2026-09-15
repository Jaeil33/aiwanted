import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThousandDots } from './ThousandDots';

describe('ThousandDots', () => {
  it('강조 사건부터 1,000타석 개수를 읽어 주는 그림(role img)', () => {
    render(<ThousandDots counts={[310, 90, 30, 5, 45, 140, 380]} highlight={0} />);
    expect(
      screen.getByRole('img', { name: '1,000번 중 삼진 310번, 볼넷 90번, 홈런 30번, 3루타 5번, 2루타 45번, 안타 140번, 범타 380번' }),
    ).toBeInTheDocument();
  });

  it('강조 사건이 가운데 있으면 그 사건을 맨 앞에 읽는다', () => {
    render(<ThousandDots counts={[310, 90, 30, 5, 45, 140, 380]} highlight={5} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^1,000번 중 안타 140번, 삼진 310번/);
  });

  it('강조가 없으면(출루 확률) 출루 합을 먼저 읽는다', () => {
    render(<ThousandDots counts={[310, 90, 30, 5, 45, 140, 380]} highlight={null} />);
    expect(screen.getByRole('img', { name: '1,000번 중 출루 310번, 삼진 310번, 범타 380번' })).toBeInTheDocument();
  });
});
