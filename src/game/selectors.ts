import { formatDeltaPp, formatPct } from '../domain/format';
import { KNOB_META, SUBJECT_LABEL } from '../domain/knobs';
import { MEASURED } from '../domain/measured';
import type { Evaluation } from '../engine';
import type { EffectPart, GameState, Side, TmiEntry } from '../types/domain';
import { batterFor, nameOf, pitcherFor, type SituationSetup } from './situation';

/*
 * 화면용 파생 값. 확률 숫자는 엔진 결과(evaluate·gaugesAtCount)에서만 온다: 옮기거나 그 값끼리 빼고 더한다(CLAUDE.md CRITICAL).
 */

/** Evaluation이나 gaugesAtCount 결과처럼 게이지로 쓸 수 있는 값 */
export interface GaugeLike {
  batterWin: number;
  inningScore: number;
  expRuns?: number;
  winHome: number;
  tie: number;
  winAway: number;
}

/** 공격 진영의 승리확률 */
export function battingWin(g: GaugeLike, batSide: Side): number {
  return batSide === 'home' ? g.winHome : g.winAway;
}

/**
 * 승부처 지수(ADR-014): 이번 타석이 끝났을 때 공격 팀 승리 가치가 평균적으로 얼마나 움직이는지(%p).
 * 100 × Σ_e pa[e] × |B(after[e]) − B(지금)|, B = 공격 팀 승리 + 무승부 / 2.
 * after가 비어 있으면(detail: false 평가) null. 실제 결과의 |WPA|(SceneRecord.leverage)는 쓰지 않는다.
 */
export function expectedSwing(ev: Pick<Evaluation, 'batSide' | 'pa' | 'after' | 'winHome' | 'winAway' | 'tie'>): number | null {
  if (ev.after.length === 0) return null;
  const value = (g: { winHome: number; tie: number; winAway: number }) => (ev.batSide === 'home' ? g.winHome : g.winAway) + g.tie / 2;
  const now = value(ev);
  let sum = 0;
  ev.after.forEach((after, e) => {
    sum += ev.pa[e] * Math.abs(value(after) - now);
  });
  return 100 * sum;
}

/** 3단 승률판 한 줄: 값은 TMI 반영(tmi) 기준, delta는 TMI 없음(base) 대비 왼쪽 값 차이 */
export interface TierView {
  id: 'pa' | 'inning' | 'game';
  title: string;
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
  extra: string | null;
  delta: number;
  deltaText: string;
}

/** 타석·이닝·경기 세 줄. 타자·투수·팀은 넘긴 상태(state) 기준 */
export function selectTiers(setup: SituationSetup, state: GameState, base: GaugeLike, tmi: GaugeLike): TierView[] {
  const batSide: Side = state.half === 0 ? 'away' : 'home';
  const fieldSide: Side = batSide === 'away' ? 'home' : 'away';
  const batTeam = setup.situation[batSide].name;
  const fldTeam = setup.situation[fieldSide].name;
  const batterName = batterFor(setup, state).name;
  const pitcherName = nameOf(setup, pitcherFor(setup, state).id);

  const row = (
    id: TierView['id'],
    title: string,
    left: { label: string; value: number; base: number },
    right: { label: string; value: number },
    extra: string | null,
  ): TierView => {
    const delta = left.value - left.base;
    return {
      id,
      title,
      leftLabel: left.label,
      leftValue: left.value,
      rightLabel: right.label,
      rightValue: right.value,
      extra,
      delta,
      deltaText: formatDeltaPp(delta),
    };
  };

  const expRuns = tmi.expRuns;
  return [
    row(
      'pa',
      '타석 승부',
      { label: `${batterName} 출루`, value: tmi.batterWin, base: base.batterWin },
      { label: `${pitcherName} 아웃`, value: 1 - tmi.batterWin },
      null,
    ),
    row(
      'inning',
      '이닝 승부',
      { label: `${batTeam} 득점`, value: tmi.inningScore, base: base.inningScore },
      { label: `${fldTeam} 무실점`, value: 1 - tmi.inningScore },
      typeof expRuns === 'number' && Number.isFinite(expRuns) ? `기대 득점 ${expRuns.toFixed(2)}점` : null,
    ),
    row(
      'game',
      '경기 승부',
      { label: `${batTeam} 승리`, value: battingWin(tmi, batSide), base: battingWin(base, batSide) },
      { label: `${fldTeam} 승리`, value: battingWin(tmi, fieldSide) },
      `무승부 ${formatPct(tmi.tie)}`,
    ),
  ];
}

/** 나비효과 점수: 공격 팀 승리확률 차이(%p 단위 숫자, 예 0.6) */
export function butterflyPp(base: GaugeLike, tmi: GaugeLike, batSide: Side): number {
  return (battingWin(tmi, batSide) - battingWin(base, batSide)) * 100;
}

/** 해석 카드 칩 하나 */
export interface EntryChip {
  label: string;
  tone: 'measured' | 'plausible' | 'fun' | 'refused';
}

const MEASURED_BY_ID = new Map(MEASURED.map((def) => [def.id, def] as const));

/** 세기 부호·크기(최대 3)만큼 ▲ 또는 ▼ */
function strengthArrows(strength: number): string {
  const size = Number.isFinite(strength) ? Math.min(3, Math.abs(Math.round(strength))) : 0;
  return (strength > 0 ? '▲' : '▼').repeat(size);
}

const formatValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function chipFor(part: EffectPart): EntryChip {
  if (part.kind === 'measured') {
    const def = MEASURED_BY_ID.get(part.variable);
    if (!def) return { label: String(part.variable), tone: 'measured' };
    if (def.transform.kind === 'indicator') return { label: part.value !== 0 ? def.label : `${def.label} 아님`, tone: 'measured' };
    return { label: `${def.label} ${formatValue(part.value)}${def.unit}`, tone: 'measured' };
  }
  const subject = Object.hasOwn(SUBJECT_LABEL, part.subject) ? SUBJECT_LABEL[part.subject] : String(part.subject);
  const knob = Object.hasOwn(KNOB_META, part.knob) ? KNOB_META[part.knob].label : String(part.knob);
  return { label: [subject, knob, strengthArrows(part.strength)].filter(Boolean).join(' '), tone: part.evidence };
}

/** 해석 카드 칩: 손잡이 "대상 손잡이 ▲▲"(근거 등급 톤), 실측 "변수 33°C"(measured), 거부면 refused 하나 */
export function entryChips(entry: TmiEntry): EntryChip[] {
  if (entry.interpretation.refused) return [{ label: '계산 거부', tone: 'refused' }];
  return entry.interpretation.parts.map(chipFor);
}
