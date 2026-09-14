import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css';

/** el에 앱을 그리고, 앱을 내리는 함수를 돌려준다. */
export function mount(el: HTMLElement): () => void {
  const root = createRoot(el);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return () => root.unmount();
}

const rootElement = document.getElementById('root');
if (rootElement) {
  mount(rootElement);
}
