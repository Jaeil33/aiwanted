import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import { SceneCard, formatSceneDate } from './SceneCard';

const SCENE = fixtureAppData.scenes[0];

describe('formatSceneDate', () => {
  it('YYYY-MM-DD를 "8월 25일"로 쓰고, 형식이 아니면 그대로 둔다', () => {
    expect(formatSceneDate('2026-08-25')).toBe('8월 25일');
    expect(formatSceneDate('2026-09-03')).toBe('9월 3일');
    expect(formatSceneDate('어제')).toBe('어제');
  });
});

describe('SceneCard', () => {
  it('날짜·구장·장면 시점 점수·상황 문장을 보여준다', () => {
    render(<SceneCard scene={SCENE} />);
    expect(screen.getByText('8월 15일')).toBeInTheDocument();
    expect(screen.getByText('픽스처 구장')).toBeInTheDocument();
    expect(screen.getByText('KIA 4 : 4 롯데')).toBeInTheDocument();
    expect(screen.getByText(SCENE.title)).toBeInTheDocument();
  });

  it('두 팀 색은 글자 없는 작은 색 막대로만 보인다', () => {
    const { container } = render(<SceneCard scene={SCENE} />);
    const away = container.querySelector('[data-team="away"]');
    const home = container.querySelector('[data-team="home"]');
    expect(away).toHaveStyle({ backgroundColor: '#F0474B' });
    expect(home).toHaveStyle({ backgroundColor: '#5C8DF6' });
    expect(away).toHaveAttribute('aria-hidden', 'true');
    expect(away?.textContent).toBe('');
  });

  it('승부처 지수 막대: leverage 0~60을 0~100% 폭으로, 60을 넘으면 100%로 자른다', () => {
    const widthFor = (leverage: number) => {
      const { unmount } = render(<SceneCard scene={{ ...SCENE, leverage }} />);
      const fill = screen.getByRole('img', { name: /승부처 지수/ }).firstElementChild as HTMLElement;
      const width = fill.style.width;
      unmount();
      return width;
    };
    expect(widthFor(38.5)).toBe('64.2%');
    expect(widthFor(60)).toBe('100%');
    expect(widthFor(90.3)).toBe('100%');
    expect(widthFor(0)).toBe('0%');
    expect(widthFor(-5)).toBe('0%');
  });

  it('href가 있으면 장면 링크, 없으면 링크가 아니다', () => {
    const { unmount } = render(<SceneCard scene={SCENE} href="#/scene/fixture-walkoff" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '#/scene/fixture-walkoff');
    unmount();
    render(<SceneCard scene={SCENE} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('실제 결과 문장·주자 기록·최종 점수를 보여주지 않는다', () => {
    const { container } = render(<SceneCard scene={SCENE} href="#/scene/fixture-walkoff" />);
    const text = container.textContent ?? '';
    expect(text).not.toContain(SCENE.actual.result);
    for (const note of SCENE.actual.notes) expect(text).not.toContain(note);
    expect(text).not.toMatch(/4\s*:\s*8/);
  });
});
