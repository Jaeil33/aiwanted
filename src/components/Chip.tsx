import type { ReactNode } from 'react';
import type { Evidence } from '../types/domain';
import styles from './Chip.module.css';

export type ChipKind = 'mode' | 'grade' | 'delta' | 'toon' | 'plain';
export type ChipTone = 'up' | 'down' | 'flat';

export interface ChipProps {
  /** mode: 현실 모드(--chalk) · toon: 만화 모드(--toon 점선) · grade: 근거 등급 · delta: 확률 변화 · plain: 중립 라벨 */
  kind: ChipKind;
  /** kind 'grade': 등급 금속색(refused는 --out) */
  grade?: Evidence | 'refused';
  /** kind 'delta': up 유리(--ball) · down 불리(--out) · flat 변화 없음(기본) */
  tone?: ChipTone;
  children: ReactNode;
}

/** 칩: 1px currentColor 테두리의 작은 라벨. 변화 칩은 테두리 대신 글자와 같은 색 10% 바탕 */
export function Chip({ kind, grade, tone, children }: ChipProps) {
  const gradeValue = kind === 'grade' ? grade : undefined;
  const toneValue = kind === 'delta' ? (tone ?? 'flat') : undefined;
  const classes = [styles.chip, styles[kind], gradeValue ? styles[gradeValue] : null, toneValue ? styles[toneValue] : null]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} data-kind={kind} data-grade={gradeValue} data-tone={toneValue}>
      {children}
    </span>
  );
}
