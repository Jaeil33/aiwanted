import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BasesDiamond } from './BasesDiamond';

const onOf = (container: HTMLElement, base: number) => container.querySelector(`[data-base="${base}"]`)?.getAttribute('data-on');

describe('BasesDiamond', () => {
  it('루마다 마름모 하나를 그리고 주자가 있는 루만 채운다 (스크린리더에는 숨김)', () => {
    const { container } = render(<BasesDiamond bases={0b101} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[data-base]')).toHaveLength(3);
    expect([onOf(container, 1), onOf(container, 2), onOf(container, 3)]).toEqual(['true', 'false', 'true']);
  });

  it('만루와 주자 없음', () => {
    const full = render(<BasesDiamond bases={7} />);
    expect(full.container.querySelectorAll('[data-on="true"]')).toHaveLength(3);
    full.unmount();
    const empty = render(<BasesDiamond bases={0} />);
    expect(empty.container.querySelectorAll('[data-on="true"]')).toHaveLength(0);
  });

  it('size로 폭을 정하고 기본은 28이다', () => {
    const small = render(<BasesDiamond bases={0} />);
    expect(small.container.querySelector('svg')).toHaveAttribute('width', '28');
    small.unmount();
    const large = render(<BasesDiamond bases={0} size={40} />);
    expect(large.container.querySelector('svg')).toHaveAttribute('width', '40');
  });
});
