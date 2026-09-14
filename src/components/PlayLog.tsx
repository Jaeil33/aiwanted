import { useId } from 'react';
import type { PlayLogEntry } from '../game';
import styles from './PlayLog.module.css';

export interface PlayLogProps {
  /** 시간 순 기록 (화면에는 최신을 위에 그린다) */
  entries: PlayLogEntry[];
}

/** 끝난 타석 기록: "9회말 · 타자 vs 투수 · 헤드라인 · 원정:홈", 승부처는 왼쪽 LED 선 */
export function PlayLog({ entries }: PlayLogProps) {
  const titleId = useId();
  return (
    <section className={styles.log} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        기록
      </h3>
      {entries.length === 0 ? (
        <p className={styles.empty}>아직 던진 공이 없어요</p>
      ) : (
        <ol className={styles.list}>
          {[...entries].reverse().map((entry) => (
            <li key={entry.index} className={styles.item} data-highlight={entry.highlight ? 'true' : undefined}>
              <span className={styles.inning}>{`${entry.inning}회${entry.half ? '말' : '초'}`}</span>
              <span className={styles.sep} aria-hidden="true">
                {' · '}
              </span>
              <span>{`${entry.batterName} vs ${entry.pitcherName}`}</span>
              <span className={styles.sep} aria-hidden="true">
                {' · '}
              </span>
              <span className={styles.headline}>{entry.headline}</span>
              <span className={styles.sep} aria-hidden="true">
                {' · '}
              </span>
              <span className={styles.score}>{`${entry.score.away}:${entry.score.home}`}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
