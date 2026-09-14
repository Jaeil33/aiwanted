import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vitest.config.ts가 있으면 vite.config.ts를 읽지 않으므로 JSX 변환용 플러그인을 여기에도 둔다.
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'api/**/*.test.ts'],
    exclude: ['reference/**', 'node_modules/**', 'dist/**', 'dist-artifact/**', 'data/**'],
    globals: false,
    // Vitest는 CSS를 빈 문자열(모듈은 클래스 이름 프록시)로 바꾼다. `?raw`로 읽는 CSS 원문 검사만 그대로 둔다(src/styles/tokens.test.ts).
    css: { include: [/\.css\?raw$/] },
  },
});
