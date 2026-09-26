import { describe, expect, it } from 'vitest';
import { SKY_KINDS, mixHex, skyKindOf, skyPalette } from './sky';

/*
 * 하늘 네 통(21-pitch-stage step 2). 경기 시작 시각으로 한 번 고른다 — 이닝에 따라 바뀌지 않는다.
 * 2026 실제 일정(8/14~9/26, 169경기)의 시작 시각 분포: 14:00 7 · 17:00 30 · 18:00 11 · 18:30 78 · 19:00 43.
 */

describe('skyKindOf', () => {
  it('돔이면 시각과 상관없이 실내다', () => {
    for (const time of ['14:00', '17:00', '18:30', '19:00']) {
      expect(skyKindOf(time, true)).toBe('dome');
    }
  });

  it('17시 전은 낮, 17시~18시 30분 전은 해질녘, 그 뒤는 밤이다', () => {
    expect(skyKindOf('14:00', false)).toBe('day');
    expect(skyKindOf('16:59', false)).toBe('day');
    expect(skyKindOf('17:00', false)).toBe('dusk');
    expect(skyKindOf('18:00', false)).toBe('dusk');
    expect(skyKindOf('18:29', false)).toBe('dusk');
    expect(skyKindOf('18:30', false)).toBe('night');
    expect(skyKindOf('19:00', false)).toBe('night');
  });

  it('실제 일정 분포에서 세 하늘이 모두 쓰인다', () => {
    // 이 분포가 곧 이 결정의 근거다: 해질녘이 24%라 네 번에 한 번은 나온다
    const schedule: Array<[string, number]> = [['14:00', 7], ['17:00', 30], ['18:00', 11], ['18:30', 78], ['19:00', 43]];
    const count = { day: 0, dusk: 0, night: 0, dome: 0 };
    for (const [time, n] of schedule) count[skyKindOf(time, false)] += n;
    expect(count).toEqual({ day: 7, dusk: 41, night: 121, dome: 0 });
  });

  it('시각을 모르면 밤이다', () => {
    expect(skyKindOf(null, false)).toBe('night');
    expect(skyKindOf('', false)).toBe('night');
  });
});

describe('skyPalette', () => {
  it('네 하늘이 모두 있고 서로 다른 잔디·관중석 색을 쓴다', () => {
    expect(SKY_KINDS).toEqual(['day', 'dusk', 'night', 'dome']);
    const grass = SKY_KINDS.map((k) => skyPalette(k).grassMid);
    const stands = SKY_KINDS.map((k) => skyPalette(k).standsBottom);
    expect(new Set(grass).size).toBe(4);
    expect(new Set(stands).size).toBe(4);
  });

  it('모든 색이 #rrggbb 꼴이다', () => {
    for (const kind of SKY_KINDS) {
      const p = skyPalette(kind);
      for (const value of [p.skyTop, p.standsTop, p.standsBottom, p.grassTop, p.grassMid, p.grassBottom, p.dirt, p.moundTop, p.fence, p.light]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
      for (const value of p.crowd) expect(value).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/);
    }
  });

  it('낮에는 조명이 꺼져 있고 관중 플래시도 안 보인다', () => {
    const day = skyPalette('day');
    expect(day.glow).toBe(0);
    expect(day.flashes).toBe(false);
    // 낮 잔디가 밤 잔디보다 밝다
    expect(day.grassMid > skyPalette('night').grassMid).toBe(true);
  });

  it('해질녘과 밤과 돔에서는 조명이 켜져 있다', () => {
    for (const kind of ['dusk', 'night', 'dome'] as const) {
      expect(skyPalette(kind).glow).toBeGreaterThan(0);
      expect(skyPalette(kind).flashes).toBe(true);
    }
  });

  it('돔은 하늘이 없다: 천장이라 위아래 밝기 차가 작다', () => {
    const dome = skyPalette('dome');
    expect(dome.skyTop).toBe(dome.standsTop);
  });
});

describe('mixHex', () => {
  it('두 색을 비율로 섞는다', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('비율은 0~1로 자른다', () => {
    expect(mixHex('#102030', '#ffffff', -1)).toBe('#102030');
    expect(mixHex('#102030', '#ffffff', 2)).toBe('#ffffff');
  });

  it('홈팀 색을 관중석에 옅게 섞어도 원래 밝기를 크게 벗어나지 않는다', () => {
    // Q16(b): 알아채기 전에 느껴지는 정도. 16%면 밤 관중석이 팀 색으로 물들되 여전히 어둡다
    const tinted = mixHex(skyPalette('night').standsBottom, '#E0457B', 0.16);
    expect(tinted).not.toBe(skyPalette('night').standsBottom);
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(tinted)).toBeLessThan(lum('#ffffff') * 0.25);
  });
});
