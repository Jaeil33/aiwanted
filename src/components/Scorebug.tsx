import { basesText } from '../domain/format';
import type { Bases, Half } from '../types/domain';
import { BasesDiamond } from './BasesDiamond';
import { CountDots } from './CountDots';
import styles from './Scorebug.module.css';

export interface ScorebugProps {
  awayName: string;
  homeName: string;
  awayColor: string;
  homeColor: string;
  awayScore: number;
  homeScore: number;
  inning: number;
  half: Half;
  outs: number;
  balls: number;
  strikes: number;
  bases: Bases;
}

/**
 * 경기장 위 방송 스코어버그: 원정·홈 두 줄(팀 색 3px 선, 공격 팀 이름 --flood, 점수 --num 19px)과 이닝 ▲▼·주자·B·S·O.
 * 그래픽은 스크린리더에서 숨기고 한 문장(aria-live)으로 읽어 준다
 */
export function Scorebug(props: ScorebugProps) {
  const { awayName, homeName, awayColor, homeColor, awayScore, homeScore, inning, half, outs, balls, strikes, bases } = props;
  const runners = bases === 0 ? '주자 없음' : `주자 ${basesText(bases)}`;
  const sentence = `${inning}회${half ? '말' : '초'} ${outs}아웃, ${runners}, 볼 ${balls} 스트라이크 ${strikes}, ${awayName} ${awayScore} 대 ${homeName} ${homeScore}`;
  const teams = [
    { side: 'away', name: awayName, color: awayColor, score: awayScore, batting: half === 0 },
    { side: 'home', name: homeName, color: homeColor, score: homeScore, batting: half === 1 },
  ] as const;

  return (
    <section className={styles.bug} aria-label="스코어버그">
      <p className={styles.srOnly} aria-live="polite">
        {sentence}
      </p>
      <div className={styles.board} aria-hidden="true">
        <div className={styles.rows}>
          {teams.map((team) => (
            <div
              key={team.side}
              className={team.batting ? `${styles.row} ${styles.batting}` : styles.row}
              data-team={team.side}
              data-batting={team.batting ? 'true' : 'false'}
            >
              <i className={styles.swatch} data-swatch="" style={{ backgroundColor: team.color }} />
              <b className={styles.name}>{team.name}</b>
              <em className={styles.score} data-score={team.side}>
                {team.score}
              </em>
            </div>
          ))}
        </div>
        <div className={styles.state}>
          <span className={styles.inning}>
            <small className={styles.half} data-half={half ? 'bottom' : 'top'}>
              {half ? '▼' : '▲'}
            </small>
            <span data-inning="">{inning}</span>
          </span>
          <BasesDiamond bases={bases} size={26} />
          <div className={styles.count}>
            <CountDots balls={balls} strikes={strikes} outs={outs} />
          </div>
        </div>
      </div>
    </section>
  );
}
