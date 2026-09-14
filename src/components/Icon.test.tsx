import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon } from './Icon';

describe('Icon', () => {
  it('야구 요소(공·티켓·저울)와 조작(빨리 감기·끝까지·되돌리기·공유·다음)만 둔다', () => {
    expect([...ICON_NAMES]).toEqual(['ball', 'ticket', 'scale', 'fast-forward', 'to-end', 'pa-end', 'restart', 'share', 'chevron-right']);
  });

  it('이름마다 24×24 currentColor 선 아이콘을 스크린리더에서 숨겨 그린다', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('data-icon', name);
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
      expect(svg?.children.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('기본 크기 24·선 굵기 2, size·strokeWidth로 바꾼다', () => {
    const plain = render(<Icon name="restart" />);
    expect(plain.container.querySelector('svg')).toHaveAttribute('width', '24');
    expect(plain.container.querySelector('svg')).toHaveAttribute('stroke-width', '2');
    plain.unmount();
    const custom = render(<Icon name="ball" size={26} strokeWidth={1.8} />);
    const svg = custom.container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '26');
    expect(svg).toHaveAttribute('height', '26');
    expect(svg).toHaveAttribute('stroke-width', '1.8');
  });
});
