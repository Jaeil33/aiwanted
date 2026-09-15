import { EV, EVENT_LABEL } from '../domain/events';
import type { Evidence, EventIndex, Side, TmiEntry } from '../types/domain';

/*
 * 타석 화면 확률 판·결과 카드의 파생 값(ADR-016). 숫자는 엔진 분포·게이지에서만 온다: 고르고 빼기만 한다(CLAUDE.md CRITICAL).
 */

/** 이번 타석 사건 분포(길이 7, 사건 순서 [K, BB, HR, 3B, 2B, 1B, OUT]) */
export type PaDist = ArrayLike<number>;

export interface OddsHeadline {
  /** 실제 결과 사건의 확률(actual) 또는 출루 확률(onBase, 실제 결과 없음) */
  kind: 'actual' | 'onBase';
  event: EventIndex | null;
  label: string;
  /** TMI 없음 값(0~1) */
  base: number;
  /** TMI 반영 값(0~1) */
  tmi: number;
  /** (tmi − base) × 100 */
  deltaPp: number;
}

/** 사건이 있으면 그 사건 확률, null이면 출루 확률(1 − 삼진 − 범타) */
export function eventValue(dist: PaDist, event: EventIndex | null): number {
  return event === null ? 1 - dist[EV.K] - dist[EV.OUT] : dist[event];
}

/** 큰 숫자 하나: "<타자> <사건> 확률"(실제 결과) 또는 "<타자> 출루 확률" */
export function oddsHeadline(args: { batterName: string; actualEvent: EventIndex | null; base: PaDist; tmi: PaDist }): OddsHeadline {
  const { batterName, actualEvent, base, tmi } = args;
  const b = eventValue(base, actualEvent);
  const t = eventValue(tmi, actualEvent);
  return {
    kind: actualEvent === null ? 'onBase' : 'actual',
    event: actualEvent,
    label: actualEvent === null ? `${batterName} 출루 확률` : `${batterName} ${EVENT_LABEL[actualEvent]} 확률`,
    base: b,
    tmi: t,
    deltaPp: (t - b) * 100,
  };
}

/** 분포를 합 1,000인 정수 7개로 나눈다(최대 잔여법, 잔여가 같으면 사건 순서가 앞선 쪽). 합이 0이거나 숫자가 아니면 모두 0 */
export function thousandSplit(dist: PaDist): number[] {
  const values = Array.from({ length: 7 }, (_, i) => dist[i] ?? 0);
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || values.some((v) => !Number.isFinite(v) || v < 0)) return [0, 0, 0, 0, 0, 0, 0];
  const scaled = values.map((v) => (v / sum) * 1000);
  const floors = scaled.map(Math.floor);
  let left = 1000 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => ({ i, rem: v - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export interface WinGauge {
  winHome: number;
  tie: number;
  winAway: number;
}

/** 경기 승리확률 한 줄: 공격 팀 승리 + 무승부/2, TMI 없음 → TMI */
export function winLine(args: { teamName: string; batSide: Side; base: WinGauge; tmi: WinGauge }): {
  team: string;
  base: number;
  tmi: number;
  deltaPp: number;
} {
  const value = (g: WinGauge) => (args.batSide === 'home' ? g.winHome : g.winAway) + g.tie / 2;
  const base = value(args.base);
  const tmi = value(args.tmi);
  return { team: args.teamName, base, tmi, deltaPp: (tmi - base) * 100 };
}

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
