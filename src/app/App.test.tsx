import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';

describe('App', () => {
  it('머리말에 제목과 부제를 보여준다', () => {
    render(<App />);
    const title = screen.getByRole('heading', { level: 1, name: 'TMI 야구' });
    expect(title.closest('header')).not.toBeNull();
    expect(screen.getByText('쓸모없는 변수, 진짜 쓸모없을까?')).toBeInTheDocument();
  });

  it('본문에 준비 중 문구를 보여준다', () => {
    render(<App />);
    expect(screen.getByText('경기장을 준비하고 있어요').closest('main')).not.toBeNull();
  });

  it('푸터에 데이터 출처를 밝힌다', () => {
    render(<App />);
    expect(screen.getByText(SOURCES).closest('footer')).not.toBeNull();
  });
});
