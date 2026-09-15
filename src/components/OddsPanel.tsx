import type { CSSProperties } from 'react';
import { EVIDENCE_LABEL, formatDeltaPp, formatPct } from '../domain/format';
import type { OddsHeadline } from '../game/headline';
import type { Evidence } from '../types/domain';
import styles from './OddsPanel.module.css';

export interface WinLineValue {
  team: string;
  base: number;
  tmi: number;
  deltaPp: number;
}

export interface OddsPanelProps {
  /** null이면 계산 중 */
  headline: OddsHeadline | null;
  hasTmi: boolean;
  grade: Evidence | null;
  win: WinLineValue | null;
  /** 승리확률 줄 앞 팀 색 띠 */
  teamColor?: string;
}

/** %p 변화의 방향: formatDeltaPp 표기와 같은 기준(0.005%p 미만은 flat) */
export function trendOf(delta: number): 'up' | 'down' | 'flat' {
  const text = formatDeltaPp(delta);
  return text.startsWith('+') ? 'up' : text.startsWith('−') ? 'down' : 'flat';
}

/** "KT 승리확률 54.3% → 52.1% (−2.2%p)", TMI가 없으면 "KT 승리확률 54.3%" */
export function winLineText(win: WinLineValue, hasTmi: boolean): string {
  if (!hasTmi) return `${win.team} 승리확률 ${formatPct(win.base)}`;
  return `${win.team} 승리확률 ${formatPct(win.base)} → ${formatPct(win.tmi)} (${formatDeltaPp(win.tmi - win.base)})`;
}

/** 확률 판: 라벨, 큰 숫자 하나(58px), TMI 없음 값·변화 칩·근거 등급, 경기 승리확률 한 줄 */
export function OddsPanel({ headline, hasTmi, grade, win, teamColor }: OddsPanelProps) {
  if (!headline) {
    return (
      <section className={styles.panel} aria-label="확률" aria-busy="true">
        <p className={styles.pending}>계산 중…</p>
      </section>
    );
  }
  const value = hasTmi ? headline.tmi : headline.base;
  const delta = headline.tmi - headline.base;
  return (
    <section className={styles.panel} aria-label="확률">
      <div className={styles.top}>
        <p className={styles.label}>{headline.label}</p>
        {hasTmi && grade && (
          <span className={styles.grade} data-grade={grade}>
            {EVIDENCE_LABEL[grade]}
          </span>
        )}
      </div>
      <div className={styles.main}>
        <p key={value.toFixed(4)} className={styles.big} aria-label={`${headline.label} ${formatPct(value)}`}>
          {(value * 100).toFixed(1)}
          <small>%</small>
        </p>
        {hasTmi && (
          <div className={styles.side}>
            <span className={styles.delta} data-trend={trendOf(delta)}>
              {formatDeltaPp(delta)}
            </span>
            <span className={styles.baseValue}>TMI 없이 {formatPct(headline.base)}</span>
          </div>
        )}
      </div>
      {win && (
        <p className={styles.win} style={teamColor ? ({ '--team': teamColor } as CSSProperties) : undefined}>
          <i aria-hidden="true" />
          {winLineText(win, hasTmi)}
        </p>
      )}
    </section>
  );
}
