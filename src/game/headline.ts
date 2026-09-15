import type { Evidence, TmiEntry } from '../types/domain';

/*
 * 자막·결과 화면·TMI 카드의 파생 값: 중계 결과 문장, 시즌 기록 한 줄, 근거 등급. 확률 숫자는 만들지 않는다(CLAUDE.md CRITICAL).
 */

/** 중계 결과 문장 → 화면 한 줄: "김타자 : 우익수 앞 1루타" → "우익수 앞 1루타"(괄호 설명은 뺀다) */
export function actualResultText(result: string): string {
  const colon = result.indexOf(':');
  const body = colon === -1 ? result : result.slice(colon + 1);
  return body.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

const rate = (x: number) => {
  const text = x.toFixed(3);
  return text.startsWith('0') ? text.slice(1) : text;
};

/** 자막 시즌 기록 한 줄: 타자 "타율 .265 · OPS .682", 투수 "ERA 7.38 · WHIP 1.86". 없거나 종류가 다르면 "2026 기록 없음" */
export function statLine(player: { kind: 'H' | 'P'; line: Record<string, number | string> } | undefined, kind: 'H' | 'P'): string {
  const none = '2026 기록 없음';
  if (!player || player.kind !== kind) return none;
  const num = (key: string) => {
    const v = player.line[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  if (kind === 'H') {
    const [avg, obp, slg] = [num('avg'), num('obp'), num('slg')];
    return avg === null || obp === null || slg === null ? none : `타율 ${rate(avg)} · OPS ${rate(obp + slg)}`;
  }
  const [era, whip] = [num('era'), num('whip')];
  return era === null || whip === null ? none : `ERA ${era.toFixed(2)} · WHIP ${whip.toFixed(2)}`;
}

const GRADE_RANK: Record<Evidence, number> = { fun: 0, plausible: 1, measured: 2 };

/** 걸린 TMI 전체의 근거 등급: 가장 약한 등급(상상 < 그럴듯함 < 실측). 거부·효과 없음만 있으면 null */
export function gradeOf(tmis: readonly TmiEntry[]): Evidence | null {
  let worst: Evidence | null = null;
  for (const entry of tmis) {
    if (entry.interpretation.refused) continue;
    for (const part of entry.interpretation.parts) {
      const grade: Evidence = part.kind === 'measured' ? 'measured' : part.evidence;
      if (worst === null || GRADE_RANK[grade] < GRADE_RANK[worst]) worst = grade;
    }
  }
  return worst;
}
