import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './main';

// 테스트는 data/ 생성물(git 제외)에 기대지 않는다: 앱 데이터가 없는 경우로 그린다
vi.mock('./data/appData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./data/appData')>()),
  APP_DATA: null,
}));

describe('mount', () => {
  it('받은 요소에 앱을 그리고, 돌려받은 함수를 부르면 요소를 비운다', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    let unmount: () => void = () => {};
    act(() => {
      unmount = mount(el);
    });
    expect(screen.getByRole('heading', { level: 1, name: 'TMI 야구' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('앱 데이터가 없어요.');
    expect(el).not.toBeEmptyDOMElement();

    act(() => {
      unmount();
    });
    expect(el).toBeEmptyDOMElement();
    el.remove();
  });
});
