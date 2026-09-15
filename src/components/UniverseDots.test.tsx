import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UniverseDots } from './UniverseDots';

describe('UniverseDots', () => {
  it('평행우주 1,000경기 묶음을 순서대로 읽어 주는 그림(role img)', () => {
    render(
      <UniverseDots
        groups={[
          { label: 'KT 승', n: 547, color: '#D6D6D6' },
          { label: '무승부', n: 133, color: '#3A434D' },
          { label: 'NC 승', n: 320, color: '#86A8EE' },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: '평행우주 1,000경기: KT 승 547번, 무승부 133번, NC 승 320번' })).toBeInTheDocument();
  });

  it('캔버스를 그릴 수 없는 환경(jsdom)에서도 오류 없이 그린다', () => {
    const { container } = render(<UniverseDots groups={[]} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
