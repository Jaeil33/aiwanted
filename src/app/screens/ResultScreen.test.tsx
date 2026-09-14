import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultScreen } from './ResultScreen';

describe('ResultScreen (자리 표시)', () => {
  it('제목 한 줄을 보여준다', () => {
    render(<ResultScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '결과' })).toBeInTheDocument();
  });
});
