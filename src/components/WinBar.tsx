import type { CSSProperties } from 'react';
import styles from './WinBar.module.css';

export interface WinBarProps {
  /** 0~1 */
  left: number;
  tie: number;
  right: number;
  /** TMI 없음 값 위치(0~1) */
  ghost: number;
  leftColor: string;
  rightColor: string;
  /** 스크린리더용 한 줄 */
  label: string;
  className?: string;
}

const pct = (x: number) => `${Number((Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0)) * 100).toFixed(3))}%`;

/** 승률 막대 8px(시안 .wp-bar): 공격 팀 색 · 무승부 빗금 · 수비 팀 색, 흰 기준선이 TMI 없음 값 */
export function WinBar({ left, tie, right, ghost, leftColor, rightColor, label, className }: WinBarProps) {
  return (
    <div
      className={[styles.bar, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
      style={{ '--a': leftColor, '--b': rightColor } as CSSProperties}
    >
      <i className={styles.a} style={{ flexBasis: pct(left) }} />
      <i className={styles.t} style={{ flexBasis: pct(tie) }} data-empty={String(!(tie > 0.0005))} />
      <i className={styles.b} style={{ flexBasis: pct(right) }} />
      <b className={styles.ghost} style={{ left: `calc(${pct(ghost)} - 1px)` }} />
    </div>
  );
}
