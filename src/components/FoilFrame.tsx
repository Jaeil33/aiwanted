import type { CSSProperties, ReactNode } from 'react';
import type { Evidence } from '../types/domain';
import styles from './FoilFrame.module.css';

/** 근거 등급 → 금속색 토큰(금 실측 · 은 그럴듯함 · 구리 상상) */
const FOIL: Record<Evidence, string> = {
  measured: 'var(--foil-real)',
  plausible: 'var(--foil-maybe)',
  fun: 'var(--foil-fun)',
};

export interface FoilFrameProps {
  grade: Evidence | 'refused';
  /** slot 8px(TMI 칸) · ticket 10px(티켓·나비효과 판) · card 12px(TMI 카드, 테두리 3px) */
  radius: 'slot' | 'ticket' | 'card';
  children: ReactNode;
  className?: string;
}

/** 근거 등급 금속 테두리. --foil을 이 요소에 정하고 같은 요소에서 테두리 그라데이션을 계산한다. 거부는 --out 1px 테두리 */
export function FoilFrame({ grade, radius, children, className }: FoilFrameProps) {
  const refused = grade === 'refused';
  const classes = [styles.frame, refused ? styles.refused : `${styles.foil} ${styles[grade]}`, styles[radius], className]
    .filter(Boolean)
    .join(' ');
  const style = refused ? undefined : ({ '--foil': FOIL[grade] } as CSSProperties);

  return (
    <div className={classes} style={style} data-grade={grade} data-radius={radius}>
      {children}
    </div>
  );
}
