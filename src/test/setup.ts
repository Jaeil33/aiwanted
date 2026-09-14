import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals를 끈 Vitest에서는 Testing Library가 afterEach를 찾지 못해 자동 정리가 돌지 않는다.
afterEach(() => {
  cleanup();
});
