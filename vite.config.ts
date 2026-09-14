import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

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
  return {
    base: './',
    plugins: [react()],
  };
});
