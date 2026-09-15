import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals를 끈 Vitest에서는 Testing Library가 afterEach를 찾지 못해 자동 정리가 돌지 않는다.
afterEach(() => {
  cleanup();
});

// jsdom에는 캔버스 2D가 없다: getContext가 매번 "not implemented" 오류를 찍지 않게 null만 돌려준다(그리기 코드는 null이면 건너뛴다).
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
}
