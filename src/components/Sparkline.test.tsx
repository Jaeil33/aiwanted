import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('값마다 점을 잇고, 첫 값 높이에 점선 기준선, 마지막 값에 점을 찍는다', () => {
    const { container } = render(<Sparkline values={[0.5, 0.56, 0.52]} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const line = svg.querySelector('polyline') as SVGPolylineElement;
    const points = (line.getAttribute('points') ?? '').trim().split(/\s+/);
    expect(points).toHaveLength(3);
    const firstY = points[0].split(',')[1];
    const base = svg.querySelector('line') as SVGLineElement;
    expect(base.getAttribute('y1')).toBe(firstY);
    expect(base.getAttribute('stroke-dasharray')).toBe('2 3');
    const dot = svg.querySelector('circle') as SVGCircleElement;
    expect(dot.getAttribute('cx')).toBe(points[2].split(',')[0]);
    // 값이 클수록 위(작은 y)
    expect(Number(points[1].split(',')[1])).toBeLessThan(Number(firstY));
  });

  it('값이 하나면 선 없이 기준선과 점만, 없으면 빈 그림', () => {
    const one = render(<Sparkline values={[0.5]} />);
    expect(one.container.querySelector('polyline')).toBeNull();
    expect(one.container.querySelector('circle')).not.toBeNull();
    one.unmount();
    const none = render(<Sparkline values={[]} />);
    expect(none.container.querySelector('circle')).toBeNull();
  });
});
