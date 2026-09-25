import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { apiDevPlugin } from './scripts/vite-api-dev.ts';

export default defineConfig(({ mode }) => {
  // `vite build --mode artifact`: 데이터·스크립트·스타일을 dist-artifact/index.html 한 파일에 담는다.
  if (mode === 'artifact') {
    return {
      base: './',
      plugins: [react(), viteSingleFile()],
      build: {
        outDir: 'dist-artifact',
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
      },
    };
  }
  // 일반 모드: 개발 서버가 api/*.ts도 함께 띄운다(apply: 'serve'라 빌드에는 끼지 않는다).
  return {
    base: './',
    plugins: [react(), apiDevPlugin()],
  };
});
