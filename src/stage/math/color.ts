/** 선수 유니폼 색 */
export interface Uniform {
  jersey: string;
  trim: string;
  pants: string;
  cap: string;
}

/** 두 #RRGGBB 색을 채널마다 amount(0 → hex, 1 → other)만큼 섞어 `rgb(r, g, b)`로 준다. */
export function mix(hex: string, other: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (v: number, shift: number) => (v >> shift) & 255;
  const m = (shift: number) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * amount);
  return `rgb(${m(16)}, ${m(8)}, ${m(0)})`;
}

/** 팀 컬러 유니폼: 홈은 흰 상의에 팀 컬러 테두리, 원정은 팀 컬러 상의 */
export function uniform(team: { color: string; home: boolean }): Uniform {
  return team.home
    ? { jersey: '#ECEFEA', trim: team.color, pants: '#D5DAD3', cap: mix(team.color, '#000000', 0.2) }
    : { jersey: mix(team.color, '#0A1520', 0.3), trim: '#ECEFEA', pants: '#98A1A7', cap: mix(team.color, '#000000', 0.4) };
}
