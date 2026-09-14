import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { TEAMS } from '../domain/teams';
import globalCss from './global.css?raw';
import tokensCss from './tokens.css?raw';

/* docs/UI_GUIDE.md 나이트게임 토큰(ADR-011)이 tokens.css에 값 그대로 있는지, 옛 이름이 별칭으로 남았는지 확인한다 */

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

/** UI_GUIDE 표의 값 그대로 */
const NEW_TOKENS: Record<string, string> = {
  // 바탕
  '--ground': '#07090B',
  '--plate': '#0F1418',
  '--plate-2': '#161C21',
  '--hair': '#252D34',
  '--hair-2': '#333D45',
  '--hud': 'rgba(6, 8, 10, 0.92)',
  // 글자
  '--chalk': '#F2EFE6',
  '--dust': '#9AA4AA',
  '--dim': '#626D73',
  // 행동·시맨틱
  '--flood': '#FFCF6B',
  '--flood-ink': '#1C1406',
  '--ball': '#3FD27E',
  '--strike': '#FFC53D',
  '--out': '#FF5043',
  '--toon': '#FF8A2A',
  // 근거 등급 금속색
  '--foil-real': '#E7C46B',
  '--foil-maybe': '#C3CED4',
  '--foil-fun': '#D98B67',
  // 글꼴
  '--callout': '"Gasoek One", "Black Han Sans", "Noto Sans KR", sans-serif',
  '--ui': '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif',
  '--num': '"Archivo", "Noto Sans KR", system-ui, sans-serif',
  // 움직임
  '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  // 반경
  '--r-board': '2px',
  '--r-control': '6px',
  '--r-slot': '8px',
  '--r-ticket': '10px',
  '--r-card': '12px',
  '--r-sheet': '16px',
  // 깊이(UI_GUIDE 반경·간격·깊이, 시트 뒤 경기장 55% 어둡게)
  '--shadow-lift': '0 40px 80px -30px rgba(0, 0, 0, 0.8)',
  '--shadow-call': '0 4px 0 rgba(0, 0, 0, 0.55)',
  '--veil': 'rgba(4, 6, 8, 0.55)',
};

/** 11-screens가 끝날 때까지 기존 화면이 깨지지 않게 남기는 옛 이름 */
const LEGACY_ALIASES: Record<string, string> = {
  '--night': 'var(--ground)',
  '--booth': 'var(--plate)',
  '--dugout': 'var(--plate-2)',
  '--rail': 'var(--hair)',
  '--board': '#05090D',
  '--chalk-2': '#C9CFCC',
  '--chalk-3': 'var(--dust)',
  '--chalk-4': 'var(--dim)',
  '--led': 'var(--flood)',
  '--led-ink': 'var(--flood-ink)',
  '--display': 'var(--callout)',
  '--body': 'var(--ui)',
  '--led-font': 'var(--num)',
  '--evidence-measured': 'var(--foil-real)',
  '--evidence-plausible': 'var(--foil-maybe)',
  '--evidence-fun': 'var(--foil-fun)',
};

describe('contrastRatio (WCAG 상대 휘도)', () => {
  it('흰색과 검은색은 21:1, 같은 색은 1:1이고 순서와 무관하다', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#07090B', '#07090B')).toBeCloseTo(1, 10);
  });

  it('알려진 값: #767676은 흰 바탕에서 4.54:1', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('#RRGGBB가 아니면 던진다', () => {
    expect(() => contrastRatio('var(--ground)', '#000000')).toThrow();
  });
});

describe('tokens.css', () => {
  it('UI_GUIDE의 새 토큰을 값 그대로 정의한다', () => {
    for (const [name, value] of Object.entries(NEW_TOKENS)) {
      expect({ name, value: TOKENS.get(name)?.toLowerCase() }).toEqual({ name, value: value.toLowerCase() });
    }
  });

  it('공격·수비 팀 색(--bat, --fld)은 teams.ts의 구단 색으로 기본값을 둔다', () => {
    const colors = Object.values(TEAMS).map((team) => team.color.toLowerCase());
    expect(colors).toContain(token('--bat').toLowerCase());
    expect(colors).toContain(token('--fld').toLowerCase());
  });

  it('옛 토큰 이름은 새 값의 별칭으로 남기고 "11-screens에서 제거" 주석을 단다', () => {
    for (const [name, value] of Object.entries(LEGACY_ALIASES)) {
      expect({ name, value: TOKENS.get(name)?.toLowerCase() }).toEqual({ name, value: value.toLowerCase() });
    }
    expect(tokensCss).toContain('11-screens에서 제거');
  });

  it('토큰 안의 var() 참조는 모두 정의된 토큰을 가리킨다', () => {
    const dangling = [...referencedTokens(tokensCss)].filter((name) => !TOKENS.has(name));
    expect(dangling).toEqual([]);
  });

  it('금지 글꼴(픽셀·옛 본문 글꼴)과 보라·인디고 계열을 쓰지 않는다', () => {
    expect(tokensCss).not.toMatch(/VT323|IBM Plex|Orbitron/i);
    expect(tokensCss).not.toMatch(/purple|indigo|violet/i);
  });
});

describe('대비 (UI_GUIDE 색상 표)', () => {
  it('--chalk·--dust는 --ground·--plate 위에서 4.5:1 이상', () => {
    for (const text of ['--chalk', '--dust']) {
      for (const ground of ['--ground', '--plate']) {
        expect({ text, ground, ok: contrastRatio(token(text), token(ground)) >= 4.5 }).toEqual({ text, ground, ok: true });
      }
    }
  });

  it('--flood-ink는 --flood 위에서 4.5:1 이상', () => {
    expect(contrastRatio(token('--flood-ink'), token('--flood'))).toBeGreaterThanOrEqual(4.5);
  });

  it('--dim은 --ground 위에서 3:1 이상 (장식 라벨 기준)', () => {
    expect(contrastRatio(token('--dim'), token('--ground'))).toBeGreaterThanOrEqual(3);
  });

  it('금속색 세 가지는 --plate 위에서 4.5:1 이상', () => {
    for (const foil of ['--foil-real', '--foil-maybe', '--foil-fun']) {
      expect({ foil, ok: contrastRatio(token(foil), token('--plate')) >= 4.5 }).toEqual({ foil, ok: true });
    }
  });
});

describe('기존 화면이 깨지지 않는다', () => {
  const cssFiles = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true });
  const tsxFiles = import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true });

  it('src의 CSS·TSX가 var()로 쓰는 토큰은 tokens.css나 그 요소 자신이 정의한다', () => {
    const sources = { ...cssFiles, ...tsxFiles };
    expect(Object.keys(cssFiles).length).toBeGreaterThan(10);
    // 컴포넌트가 스스로 정하는 지역 변수(--c, --foil 등): CSS 선언이나 style 객체 키('--이름')
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

  it('바탕·글자·본문 글꼴과 한국어 줄바꿈을 새 토큰으로 준다', () => {
    expect(clean).toMatch(/html, body \{[^}]*background: var\(--ground\)/);
    expect(clean).toMatch(/html, body \{[^}]*color: var\(--chalk\)/);
    expect(clean).toMatch(/html, body \{[^}]*font: 400 15px\/1\.6 var\(--ui\)/);
    expect(clean).toContain('word-break: keep-all');
    expect(clean).toContain('overflow-wrap: break-word');
  });

  it('포커스 링은 --flood 2px, 숨김·버튼 글꼴 상속·숫자 유틸을 둔다', () => {
    expect(clean).toContain('outline: 2px solid var(--flood)');
    expect(clean).toContain('outline-offset: 2px');
    expect(clean).toMatch(/\[hidden\] \{ display: none !important; \}/);
    expect(clean).toMatch(/button, input \{[^}]*font: inherit;[^}]*color: inherit;/);
    expect(clean).toMatch(/\.num \{[^}]*font-family: var\(--num\);[^}]*font-stretch: 76%;[^}]*font-variant-numeric: tabular-nums;/);
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
  it('Archivo·Gasoek One·Noto Sans KR 글꼴을 Google Fonts에서 받고 preconnect 두 줄을 둔다', () => {
    expect(indexHtml.replaceAll('&amp;', '&')).toContain(
      'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Gasoek+One&family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap',
    );
    expect(indexHtml).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/);
    expect(indexHtml).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/);
    expect(indexHtml).not.toMatch(/VT323|IBM\+Plex|Black\+Han\+Sans/);
  });

  it('theme-color는 --ground(#07090B)', () => {
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#07090B"\s*\/?>/i);
  });
});
