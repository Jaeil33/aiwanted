import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { skyPalette } from '../stage/math/sky';
import { StadiumLife } from './StadiumLife';

/*
 * 살아 있는 배경(21-pitch-stage step 3). JS 루프 없이 CSS 애니메이션만 쓴다(/grill-me Q18 c·Q22 b).
 * 캔버스 위에 겹치되 빛을 더하기만 하므로(screen) 공을 가리지 않는다.
 */

const layer = () => document.querySelector('[data-testid="stadium-life"]') as HTMLElement;

describe('StadiumLife', () => {
  it('화면에 읽히지 않고 손가락도 받지 않는다', () => {
    render(<StadiumLife sky="night" />);
    const el = layer();
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('밤에는 관중·조명·플래시가 모두 있다', () => {
    render(<StadiumLife sky="night" />);
    const el = layer();
    expect(el.querySelectorAll('[data-part="crowd"]').length).toBe(2);
    expect(el.querySelectorAll('[data-part="glow"]').length).toBe(2);
    expect(el.querySelectorAll('[data-part="flash"]').length).toBeGreaterThan(4);
  });

  it('낮에는 조명도 플래시도 없다', () => {
    // 팔레트가 정한다: 낮은 glow 0, flashes false
    expect(skyPalette('day').glow).toBe(0);
    render(<StadiumLife sky="day" />);
    const el = layer();
    expect(el.querySelectorAll('[data-part="glow"]').length).toBe(0);
    expect(el.querySelectorAll('[data-part="flash"]').length).toBe(0);
    // 관중은 낮에도 있다
    expect(el.querySelectorAll('[data-part="crowd"]').length).toBe(2);
  });

  it('해질녘·돔에도 조명과 플래시가 있고 하늘마다 빛 색이 다르다', () => {
    const lights = new Set<string>();
    for (const kind of ['dusk', 'night', 'dome'] as const) {
      const { unmount } = render(<StadiumLife sky={kind} />);
      const el = layer();
      expect(el.querySelectorAll('[data-part="glow"]').length).toBe(2);
      expect(el.querySelectorAll('[data-part="flash"]').length).toBeGreaterThan(4);
      lights.add(el.style.getPropertyValue('--light'));
      unmount();
    }
    expect(lights.size).toBe(3);
  });

  it('플래시는 저마다 다른 때에 터진다', () => {
    render(<StadiumLife sky="night" />);
    const delays = [...layer().querySelectorAll('[data-part="flash"]')].map((el) => (el as HTMLElement).style.animationDelay);
    expect(new Set(delays).size).toBe(delays.length);
  });
});
