import { useId, type CSSProperties } from 'react';
import { TEAMS } from '../../domain/teams';
import type { TeamCode } from '../../types/data';
import { formatRoute } from '../router';
import styles from './TeamsScreen.module.css';

/*
 * 10구단 일정 입구(ADR-032). 누르면 그 팀 달력으로 간다 — 그게 전부다.
 * 응원팀은 없앴다(ADR-039): 어느 팀도 다른 팀보다 앞에 오지 않고, 이 화면은 아무것도 저장하지 않는다.
 */

/** 화면에 세우는 순서: teams.ts에 적은 차례 그대로 */
const TEAM_CODES = Object.keys(TEAMS) as TeamCode[];

export function TeamsScreen() {
  const titleId = useId();

  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        구단 일정
      </h2>
      <p className={styles.note}>팀을 누르면 그 팀 달력으로 가요. 2026 정규시즌에서 치른 경기를 모두 볼 수 있어요.</p>

      <ul className={styles.grid} aria-label="구단">
        {TEAM_CODES.map((code) => (
          <li key={code}>
            <a
              className={styles.team}
              href={formatRoute({ screen: 'team', code, month: null })}
              style={{ '--c': TEAMS[code].color } as CSSProperties}
            >
              <i aria-hidden="true" />
              {TEAMS[code].name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
