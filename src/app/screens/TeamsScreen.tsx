import { useId, type CSSProperties } from 'react';
import controls from '../../components/controls.module.css';
import { TEAMS } from '../../domain/teams';
import type { TeamCode } from '../../types/data';
import { formatRoute } from '../router';
import { useFavouriteTeam } from '../useFavouriteTeam';
import styles from './TeamsScreen.module.css';

/*
 * 10구단 일정 입구(ADR-032).
 *
 * **팀을 누르는 것은 응원팀을 정하는 것이 아니다**(20-browse-ui step 1). 여기서는 그 팀 일정으로만 간다.
 * 응원팀은 팀 화면에서 정한다 — 일정을 한 번 본 팀이 눌러앉아 다른 경기를 가리지 않게.
 */

/** 화면에 세우는 순서: teams.ts에 적은 차례 그대로 */
const TEAM_CODES = Object.keys(TEAMS) as TeamCode[];

export function TeamsScreen() {
  const [team, setTeam] = useFavouriteTeam();
  const titleId = useId();

  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        구단 일정
      </h2>
      <p className={styles.note}>
        팀을 누르면 그 팀 달력으로 가요. 응원팀은 팀 화면에서 정하고, 이 기기에만 남아요 — 다른 팀을 가리지 않아요.
      </p>

      <ul className={styles.grid} aria-label="구단">
        {TEAM_CODES.map((code) => (
          <li key={code}>
            <a
              className={styles.team}
              href={formatRoute({ screen: 'team', code, month: null })}
              style={{ '--c': TEAMS[code].color } as CSSProperties}
              data-mine={String(team === code)}
            >
              <i aria-hidden="true" />
              {TEAMS[code].name}
              {/* 읽어 주는 이름이 "롯데내 팀"으로 붙지 않게 사이를 띄운다(플렉스는 공백 노드를 칸으로 세지 않는다) */}
              {team === code && <> <em className={styles.mine}>내 팀</em></>}
            </a>
          </li>
        ))}
      </ul>

      {team !== null && (
        <button type="button" className={`${controls.secondary} ${styles.clear}`} onClick={() => setTeam(null)}>
          응원팀 지우기
        </button>
      )}
    </section>
  );
}
