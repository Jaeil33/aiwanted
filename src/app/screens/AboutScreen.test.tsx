import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AboutScreen } from './AboutScreen';

describe('AboutScreen (자리 표시)', () => {
  it('제목 한 줄을 보여준다', () => {
    render(<AboutScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '만든 이유' })).toBeInTheDocument();
  });
});
