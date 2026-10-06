import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { TEAMS } from '../domain/teams';
import globalCss from './global.css?raw';
import tokensCss from './tokens.css?raw';

/* docs/UI_GUIDE.md 중계 트래커 토큰(ADR-018)이 tokens.css에 값 그대로 있는지, 옛 이름이 새 값의 별칭으로 남았는지 확인한다 */

/** CSS 원문에서 사용자 속성 선언(--이름: 값)을 모은다. 주석은 지우고 값의 공백은 한 칸으로 줄인다 */
function customProperties(css: string): Map<string, string> {
  const props = new Map<string, string>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    props.set(match[1], match[2].trim().replace(/\s+/g, ' '));
  }
  return props;
}

/** 원문에서 var(--이름)으로 참조하는 이름 */
function referencedTokens(source: string): Set<string> {
  return new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]));
}

/** #RRGGBB → [r, g, b] (0~255) */
function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`#RRGGBB 색이 아니에요: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x 상대 휘도(sRGB 선형화 후 가중 합) */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 대비(1~21): (밝은 휘도 + 0.05) / (어두운 휘도 + 0.05) */
function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const TOKENS = customProperties(tokensCss);
const token = (name: string): string => {
  const value = TOKENS.get(name);
  if (value === undefined) throw new Error(`${name} 토큰이 없어요`);
  return value;
};

/** UI_GUIDE 색상·타이포·반경 표의 값 그대로 */
const BROADCAST_TOKENS: Record<string, string> = {
  '--bg': '#05070A',
  '--surface': '#0C1016',
  '--surface-2': '#121821',
  '--surface-3': '#1A222D',
  '--line': '#1D2530',
  '--line-2': '#2A3441',
  '--text': '#F3F5F7',
  '--text-2': '#A3ADB8',
  '--text-3': '#6A7581',
  '--accent': '#FFD23F',
  '--accent-ink': '#141005',
  '--ball': '#2FD27A',
  '--strike': '#FFB020',
  '--out': '#FF4D4F',
  '--inplay': '#4DA3FF',
  '--up': '#2FD27A',
  '--down': '#FF6B6B',
  '--g-measured': '#4DA3FF',
  '--g-plausible': '#B9C3CD',
  '--g-fun': '#FF8A5B',
  '--num': '"Barlow Semi Condensed", "Noto Sans KR", system-ui, sans-serif',
  '--ui': '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif',
  '--r-chip': '6px',
  '--r-row': '8px',
  '--r-card': '12px',
  '--r-sheet': '16px',
  '--r-pill': '999px',
  '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  '--shadow-sheet': '0 -20px 60px -20px rgba(0, 0, 0, 0.8)',
};

/** 옛 화면(판정표·신뢰도·시트 등)이 아직 쓰는 이름: 새 토큰을 가리키는 별칭 */
const LEGACY_ALIASES: Record<string, string> = {
  '--ground': 'var(--bg)',
  '--plate': 'var(--surface)',
  '--plate-2': 'var(--surface-2)',
  '--hair': 'var(--line)',
  '--hair-2': 'var(--line-2)',
  '--chalk': 'var(--text)',
  '--dust': 'var(--text-2)',
  '--dim': 'var(--text-3)',
  '--flood': 'var(--accent)',
  '--flood-ink': 'var(--accent-ink)',
  '--toon': 'var(--g-fun)',
  '--foil-real': 'var(--g-measured)',
  '--foil-maybe': 'var(--g-plausible)',
  '--foil-fun': 'var(--g-fun)',
  '--callout': 'var(--ui)',
  '--display': 'var(--ui)',
  '--body': 'var(--ui)',
  '--led-font': 'var(--num)',
};

describe('contrastRatio (WCAG 상대 휘도)', () => {
  it('흰색과 검은색은 21:1, 같은 색은 1:1이고 순서와 무관하다', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#05070A', '#05070A')).toBeCloseTo(1, 10);
  });

  it('#RRGGBB가 아니면 던진다', () => {
    expect(() => contrastRatio('var(--bg)', '#000000')).toThrow();
  });
});

describe('tokens.css', () => {
  it('UI_GUIDE 중계 토큰을 값 그대로 정의한다', () => {
    for (const [name, value] of Object.entries(BROADCAST_TOKENS)) {
      expect({ name, value: TOKENS.get(name)?.toLowerCase() }).toEqual({ name, value: value.toLowerCase() });
    }
  });

  it('공격·수비 팀 색(--bat, --fld)은 teams.ts의 구단 색으로 기본값을 둔다', () => {
    const colors = Object.values(TEAMS).map((team) => team.color.toLowerCase());
    expect(colors).toContain(token('--bat').toLowerCase());
    expect(colors).toContain(token('--fld').toLowerCase());
  });

  it('옛 토큰 이름은 새 토큰의 별칭으로 남긴다', () => {
    for (const [name, value] of Object.entries(LEGACY_ALIASES)) {
      expect({ name, value: TOKENS.get(name)?.toLowerCase() }).toEqual({ name, value: value.toLowerCase() });
    }
  });

  it('토큰 안의 var() 참조는 모두 정의된 토큰을 가리킨다', () => {
    const dangling = [...referencedTokens(tokensCss)].filter((name) => !TOKENS.has(name));
    expect(dangling).toEqual([]);
  });

  it('포스터·픽셀 글꼴과 보라·인디고 계열을 쓰지 않는다(UI_GUIDE 하지 마라)', () => {
    expect(tokensCss).not.toMatch(/Gasoek|Archivo|VT323|Orbitron/i);
    expect(tokensCss).not.toMatch(/purple|indigo|violet/i);
  });
});

describe('대비 (UI_GUIDE 색상 표)', () => {
  it('--text·--text-2는 --bg·--surface·--surface-2 위에서 7:1 이상', () => {
    for (const text of ['--text', '--text-2']) {
      for (const ground of ['--bg', '--surface', '--surface-2']) {
        expect({ text, ground, ok: contrastRatio(token(text), token(ground)) >= 7 }).toEqual({ text, ground, ok: true });
      }
    }
  });

  it('--accent-ink는 --accent 위에서 4.5:1 이상, --text-3은 --bg 위에서 3:1 이상', () => {
    expect(contrastRatio(token('--accent-ink'), token('--accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('--text-3'), token('--bg'))).toBeGreaterThanOrEqual(3);
  });

  it('근거 등급·콜 색은 --surface 위에서 4.5:1 이상', () => {
    for (const name of ['--g-measured', '--g-plausible', '--g-fun', '--ball', '--strike', '--out', '--inplay', '--up', '--down']) {
      expect({ name, ok: contrastRatio(token(name), token('--surface')) >= 4.5 }).toEqual({ name, ok: true });
    }
  });
});

describe('기존 화면이 깨지지 않는다', () => {
  const cssFiles = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true });
  const tsxFiles = import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true });

  it('src의 CSS·TSX가 var()로 쓰는 토큰은 tokens.css나 그 요소 자신이 정의한다', () => {
    const sources = { ...cssFiles, ...tsxFiles };
    expect(Object.keys(cssFiles).length).toBeGreaterThan(10);
    // 컴포넌트가 스스로 정하는 지역 변수(--c, --team 등): CSS 선언이나 style 객체 키('--이름')
    const local = new Set<string>();
    for (const source of Object.values(sources)) {
      for (const name of customProperties(source).keys()) local.add(name);
      for (const match of source.matchAll(/['"](--[\w-]+)['"]\s*:/g)) local.add(match[1]);
    }
    const missing = Object.entries(sources).flatMap(([file, source]) =>
      [...referencedTokens(source)].filter((name) => !TOKENS.has(name) && !local.has(name)).map((name) => `${file}: ${name}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('global.css', () => {
  const clean = globalCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

  it('바탕·글자·본문 글꼴과 한국어 줄바꿈을 중계 토큰으로 준다', () => {
    expect(clean).toMatch(/html, body \{[^}]*background: var\(--bg\)/);
    expect(clean).toMatch(/html, body \{[^}]*color: var\(--text\)/);
    expect(clean).toMatch(/html, body \{[^}]*font: 400 14px\/1\.5 var\(--ui\)/);
    expect(clean).toContain('word-break: keep-all');
    expect(clean).toContain('overflow-wrap: break-word');
  });

  it('포커스 링은 --accent 2px, 숨김·버튼 글꼴 상속·숫자 유틸을 둔다', () => {
    expect(clean).toContain('outline: 2px solid var(--accent)');
    expect(clean).toContain('outline-offset: 2px');
    expect(clean).toMatch(/\[hidden\] \{ display: none !important; \}/);
    expect(clean).toMatch(/button, input \{[^}]*font: inherit;[^}]*color: inherit;/);
    expect(clean).toMatch(/\.num \{[^}]*font-family: var\(--num\);[^}]*font-variant-numeric: tabular-nums;/);
  });

  it('동작 줄이기에서는 모든 animation·transition을 1ms로 줄인다', () => {
    const reduced = clean.slice(clean.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced.length).toBeLessThan(clean.length);
    expect(reduced).toMatch(/\*, \*::before, \*::after \{/);
    expect(reduced).toContain('animation-duration: 1ms !important');
    expect(reduced).toContain('transition-duration: 1ms !important');
  });

  it('옛 토큰 이름을 쓰지 않는다', () => {
    const legacy = [...referencedTokens(globalCss)].filter((name) => Object.hasOwn(LEGACY_ALIASES, name));
    expect(legacy).toEqual([]);
  });
});

describe('index.html', () => {
  it('Barlow Semi Condensed·Noto Sans KR 글꼴을 Google Fonts에서 받고 preconnect 두 줄을 둔다', () => {
    expect(indexHtml.replaceAll('&amp;', '&')).toContain(
      'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700;800&family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap',
    );
    expect(indexHtml).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/);
    expect(indexHtml).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/);
    expect(indexHtml).not.toMatch(/Gasoek|Archivo|VT323|Black\+Han\+Sans/);
  });

  it('theme-color는 --bg(#05070A)', () => {
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#05070A"\s*\/?>/i);
  });
});
