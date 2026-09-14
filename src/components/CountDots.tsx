import styles from './CountDots.module.css';

export interface CountDotsProps {
  balls: number;
  strikes: number;
  outs: number;
}

const ROWS = [
  { letter: 'B', dot: 'ball', slots: 3 },
  { letter: 'S', dot: 'strike', slots: 2 },
  { letter: 'O', dot: 'out', slots: 2 },
] as const;

const litCount = (n: number, slots: number) => (Number.isFinite(n) ? Math.min(slots, Math.max(0, Math.floor(n))) : 0);
const spoken = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** 볼·스트라이크·아웃 점(B 3 · S 2 · O 2). 켜진 점은 --ball · --strike · --out, 꺼진 점 --hair-2 */
export function CountDots({ balls, strikes, outs }: CountDotsProps) {
  const counts = { ball: balls, strike: strikes, out: outs };
  return (
    <div role="img" aria-label={`볼 ${spoken(balls)}, 스트라이크 ${spoken(strikes)}, 아웃 ${spoken(outs)}`} className={styles.count}>
      {ROWS.map((row) => {
        const on = litCount(counts[row.dot], row.slots);
        return (
          <span key={row.dot} className={styles.group}>
            <span className={styles.letter} data-letter="">
              {row.letter}
            </span>
            {Array.from({ length: row.slots }, (_, index) => (
              <i key={index} className={`${styles.dot} ${styles[row.dot]}`} data-dot={row.dot} data-on={index < on ? 'true' : 'false'} />
            ))}
          </span>
        );
      })}
    </div>
  );
}
