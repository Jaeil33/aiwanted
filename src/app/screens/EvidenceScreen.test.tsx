import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceScreen } from './EvidenceScreen';

describe('EvidenceScreen (자리 표시)', () => {
  it('제목 한 줄을 보여준다', () => {
    render(<EvidenceScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '판정소' })).toBeInTheDocument();
  });
});
