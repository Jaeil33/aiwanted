import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { detectPlatform } from './app/platform';
import './styles/tokens.css';
import './styles/global.css';

/** el에 앱을 그리고, 앱을 내리는 함수를 돌려준다. 실행 환경(아티팩트·워커·AI)은 그리는 동안 알아낸다. */
export function mount(el: HTMLElement): () => void {
  const root = createRoot(el);
  root.render(
    <StrictMode>
      <App platformPromise={detectPlatform(window)} />
    </StrictMode>,
  );
  return () => root.unmount();
}

const rootElement = document.getElementById('root');
if (rootElement) {
  mount(rootElement);
}
