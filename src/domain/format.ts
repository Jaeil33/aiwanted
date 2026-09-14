import type { Bases, Evidence, GameState, Mode } from '../types/domain';

/** 확률(0~1)을 소수 첫째 자리 퍼센트로 쓴다: 0.362 → "36.2%" */
export function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/**
 * 확률 차이(0~1 단위)를 %p로 쓴다: "+0.6%p", "−0.07%p"(U+2212), "±0.00%p".
 * 0.1%p 미만은 소수 둘째 자리, 0.005%p 미만이거나 숫자가 아니면 ±0.00%p.
 */
export function formatDeltaPp(d: number): string {
  const p = Math.abs(d) * 100;
  if (!(p >= 0.005)) return '±0.00%p';
  return `${d > 0 ? '+' : '−'}${p.toFixed(p < 0.1 ? 2 : 1)}%p`;
}

/** 단어의 받침에 맞춰 조사를 붙인다: josa('투수', '이/가') → "투수가" */
export function josa(word: string, pair: '이/가' | '은/는' | '을/를' | '으로/로'): string {
  const [withFinal, withoutFinal] = pair.split('/');
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xAC00 || code > 0xD7A3) return word + withoutFinal;
  const jong = (code - 0xAC00) % 28;
  if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? '로' : '으로');
  return word + (jong ? withFinal : withoutFinal);
}

const OUTS_TEXT = ['무사', '1사', '2사', '3아웃'];

/** 주자 비트마스크(1루=1, 2루=2, 3루=4)를 글로 쓴다: "주자 없음", "1·3루", "만루" */
export function basesText(bases: Bases): string {
  if (bases === 0) return '주자 없음';
  if (bases === 7) return '만루';
  return `${[1, 2, 3].filter((b) => (bases >> (b - 1)) & 1).join('·')}루`;
}

/** 장면 상황을 한 줄로 쓴다: "9회말 2사 만루" */
export function situationText(state: Pick<GameState, 'inning' | 'half' | 'outs' | 'bases'>): string {
  return `${state.inning}회${state.half ? '말' : '초'} ${OUTS_TEXT[Math.min(state.outs, 3)]} ${basesText(state.bases)}`;
}

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  measured: '실측',
  plausible: '그럴듯함',
  fun: '상상',
};

export const MODE_LABEL: Record<Mode, string> = {
  real: '현실 모드',
  toon: '만화 모드',
};
