import type { CSSProperties } from 'react';
import { formatRoute } from '../app/router';
import { TEAMS } from '../domain/teams';
import type { TeamCode } from '../types/data';
import styles from './TeamStrip.module.css';

/*
 * 10구단 띠(20-browse-ui step 2). 탐색 화면 맨 위에 늘 둔다.
 *
 * 다른 팀 일정으로 갈 길이 눈에 띄지 않는다는 말에서 나왔다. 어느 화면에서든 한 번에 닿게 하는 것이 이 띠의 일이다.
 * **어느 팀도 앞에 오지 않는다**(ADR-039) — 순서는 늘 `teams.ts`에 적은 차례라 손가락이 자리를 기억할 수 있다.
 */

/** 세우는 순서: teams.ts에 적은 차례 그대로 */
const TEAM_CODES = Object.keys(TEAMS) as TeamCode[];

export interface TeamStripProps {
  /** 지금 보고 있는 팀. 그 칩에 aria-current="page" */
  current?: TeamCode | null;
}

export function TeamStrip({ current = null }: TeamStripProps) {
  return (
    <nav className={styles.strip} aria-label="구단 일정">
      <ul className={styles.list}>
        {TEAM_CODES.map((code) => (
          <li key={code}>
            <a
              className={styles.chip}
              href={formatRoute({ screen: 'team', code, month: null })}
              style={{ '--c': TEAMS[code].color } as CSSProperties}
              aria-current={code === current ? 'page' : undefined}
            >
              <i aria-hidden="true" />
              {TEAMS[code].name}
            </a>
          </li>
        ))}
        <li>
          <a className={`${styles.chip} ${styles.all}`} href={formatRoute({ screen: 'teams' })}>
            구단 전체
          </a>
        </li>
      </ul>
    </nav>
  );
}
