import { basesText } from '../domain/format';
import type { Bases, Half } from '../types/domain';
import { BasesDiamond } from './BasesDiamond';
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

/** 스코어버그: 점수·이닝·B·S·O·주자. 화면은 전광판 그래픽, 스크린리더는 한 문장으로 읽는다 */
export function Scorebug(props: ScorebugProps) {
  const { awayName, homeName, awayColor, homeColor, awayScore, homeScore, inning, half, outs, balls, strikes, bases } = props;
  const runners = bases === 0 ? '주자 없음' : `주자 ${basesText(bases)}`;
  const sentence = `${inning}회${half ? '말' : '초'} ${outs}아웃, ${runners}, 볼 ${balls} 스트라이크 ${strikes}, ${awayName} ${awayScore} 대 ${homeName} ${homeScore}`;
  const outsLit = Math.max(0, Math.min(outs, 3));
  const teams = [
    { side: 'away', name: awayName, color: awayColor, score: awayScore, batting: half === 0 },
    { side: 'home', name: homeName, color: homeColor, score: homeScore, batting: half === 1 },
  ] as const;

  return (
    <section className={styles.bug} aria-label="전광판">
      <p className={styles.srOnly} aria-live="polite">
        {sentence}
      </p>
      <div className={styles.board} aria-hidden="true">
        <div className={styles.teams}>
          {teams.map((team) => (
            <div key={team.side} className={styles.team} data-team={team.side} data-batting={team.batting ? 'true' : 'false'}>
              <span className={styles.swatch} data-swatch="" style={{ backgroundColor: team.color }} />
              <span className={styles.teamName}>{team.name}</span>
              <span className={styles.score} data-score={team.side}>
                {team.score}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.inning}>
          <span className={styles.half} data-half={half ? 'bottom' : 'top'}>
            {half ? '▼' : '▲'}
          </span>
          <span className={styles.led} data-inning="">
            {inning}
          </span>
        </div>
        <div className={styles.count}>
          <span className={styles.countRow}>
            <span className={styles.countLabel}>B</span>
            <span className={`${styles.countValue} ${styles.balls}`} data-count="balls">
              {balls}
            </span>
          </span>
          <span className={styles.countRow}>
            <span className={styles.countLabel}>S</span>
            <span className={`${styles.countValue} ${styles.strikes}`} data-count="strikes">
              {strikes}
            </span>
          </span>
          <span className={styles.countRow}>
            <span className={styles.countLabel}>O</span>
            <span className={styles.dots}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={styles.dot} data-out-dot="" data-on={i < outsLit ? 'true' : 'false'} />
              ))}
            </span>
          </span>
        </div>
        <BasesDiamond bases={bases} size={40} />
      </div>
    </section>
  );
}
