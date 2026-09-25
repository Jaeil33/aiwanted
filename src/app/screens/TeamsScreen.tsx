import { useId, type CSSProperties } from 'react';
import controls from '../../components/controls.module.css';
import { TEAMS } from '../../domain/teams';
import type { TeamCode } from '../../types/data';
import { useFavouriteTeam } from '../useFavouriteTeam';
import { useHashRoute } from '../useHashRoute';
import styles from './TeamsScreen.module.css';

/** 화면에 세우는 순서: teams.ts에 적은 차례 그대로 */
const TEAM_CODES = Object.keys(TEAMS) as TeamCode[];

/** 응원팀 고르기(ADR-032·034). 고른 팀은 이 기기에만 남고 주소로는 공유된다 */
export function TeamsScreen() {
  const [team, setTeam] = useFavouriteTeam();
  const [, setRoute] = useHashRoute();
  const titleId = useId();

  const pick = (code: TeamCode) => {
    setTeam(code);
    setRoute({ screen: 'team', code, month: null });
  };

  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        응원하는 팀
      </h2>
      <p className={styles.note}>고른 팀은 이 기기에만 남아요. 다른 값은 저장하지 않아요.</p>

      <ul className={styles.grid}>
        {TEAM_CODES.map((code) => (
          <li key={code}>
            <button
              type="button"
              className={styles.team}
              style={{ '--c': TEAMS[code].color } as CSSProperties}
              aria-pressed={team === code}
              onClick={() => pick(code)}
            >
              <i aria-hidden="true" />
              {TEAMS[code].name}
            </button>
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
