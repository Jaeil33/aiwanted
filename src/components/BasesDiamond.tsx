import type { Bases } from '../types/domain';
import styles from './BasesDiamond.module.css';

/** 루 마름모 자리 (viewBox 34×30): 1루 오른쪽, 2루 위, 3루 왼쪽 */
const DIAMONDS = [
  { base: 1, x: 20, y: 12 },
  { base: 2, x: 13, y: 3 },
  { base: 3, x: 6, y: 12 },
] as const;
const SIDE = 8;

export interface BasesDiamondProps {
  bases: Bases;
  /** 폭(px). 기본 28 */
  size?: number;
}

/** 주자 다이아몬드: 채워진 루는 --led. 장식이므로 스크린리더에서 숨긴다(상황 문장은 부모가 읽어 준다) */
export function BasesDiamond({ bases, size = 28 }: BasesDiamondProps) {
  return (
    <svg className={styles.diamond} width={size} height={Math.round((size * 30) / 34)} viewBox="0 0 34 30" aria-hidden="true" focusable="false">
      {DIAMONDS.map(({ base, x, y }) => {
        const on = ((bases >> (base - 1)) & 1) === 1;
        return (
          <rect
            key={base}
            data-base={base}
            data-on={on ? 'true' : 'false'}
            className={on ? styles.on : styles.off}
            x={x}
            y={y}
            width={SIDE}
            height={SIDE}
            transform={`rotate(45 ${x + SIDE / 2} ${y + SIDE / 2})`}
          />
        );
      })}
    </svg>
  );
}
