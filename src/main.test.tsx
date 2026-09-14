import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mount } from './main';

describe('mount', () => {
  it('받은 요소에 앱을 그리고, 돌려받은 함수를 부르면 요소를 비운다', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    let unmount: () => void = () => {};
    act(() => {
      unmount = mount(el);
    });
    expect(screen.getByRole('heading', { level: 1, name: 'TMI 야구' })).toBeInTheDocument();
    expect(el).not.toBeEmptyDOMElement();

    act(() => {
      unmount();
    });
    expect(el).toBeEmptyDOMElement();
    el.remove();
  });
});
