import { describe, expect, it } from 'vitest';
import { mix, uniform } from './color';

describe('mix', () => {
  it('amount 0이면 원래 색, 1이면 other 색을 rgb()로 준다', () => {
    expect(mix('#F0474B', '#000000', 0)).toBe('rgb(240, 71, 75)');
    expect(mix('#F0474B', '#5C8DF6', 1)).toBe('rgb(92, 141, 246)');
  });

  it('채널마다 선형으로 섞고 반올림한다', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mix('#F0474B', '#0A1520', 0.3)).toBe('rgb(171, 56, 62)');
  });
});

describe('uniform', () => {
  it('홈팀은 흰 상의에 팀 컬러 테두리, 모자는 팀 컬러를 20% 어둡게', () => {
    expect(uniform({ color: '#F0474B', home: true })).toEqual({
      jersey: '#ECEFEA',
      trim: '#F0474B',
      pants: '#D5DAD3',
      cap: 'rgb(192, 57, 60)',
    });
  });

  it('원정팀은 팀 컬러를 밤색과 섞은 상의, 모자는 40% 어둡게', () => {
    expect(uniform({ color: '#5C8DF6', home: false })).toEqual({
      jersey: 'rgb(67, 105, 182)',
      trim: '#ECEFEA',
      pants: '#98A1A7',
      cap: 'rgb(55, 85, 148)',
    });
  });
});
