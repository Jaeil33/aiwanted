import type { CSSProperties } from 'react';
import { basesText } from '../domain/format';
import type { Bases, Half } from '../types/domain';
import styles from './BroadcastBug.module.css';

export interface BugTeam {
  name: string;
  color: string;
  score: number;
}

export interface BroadcastBugProps {
  away: BugTeam;
  home: BugTeam;
  inning: number;
  half: Half;
  outs: number;
  bases: Bases;
  balls: number;
  strikes: number;
  backHref: string;
}

const BASE_CELLS: ReadonlyArray<[number, number, number]> = [
  [15, 1, 2],
  [24, 10, 1],
  [6, 10, 4],
];

/** 주자 다이아몬드(2루 위, 1루 오른쪽, 3루 왼쪽). 켜진 루는 --accent */
export function BasesGlyph({ bases, className }: { bases: Bases; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 24" role="img" aria-label={basesText(bases)}>
      {BASE_CELLS.map(([x, y, bit]) => (
        <path key={bit} className={styles.baseCell} data-on={String((bases & bit) !== 0)} d={`M${x} ${y}l6 6-6 6-6-6z`} />
      ))}
    </svg>
  );
}

/** 중계 스코어버그: 뒤로, 두 팀(팀 색 띠·이름·점수, 공격 팀 점), 이닝 ▲▼, 주자, 볼카운트, 아웃 */
export function BroadcastBug({ away, home, inning, half, outs, bases, balls, strikes, backHref }: BroadcastBugProps) {
  const rows = [
    { side: 'away', team: away, batting: half === 0 },
    { side: 'home', team: home, batting: half === 1 },
  ] as const;
  return (
    <div className={styles.bug} role="group" aria-label="스코어버그">
      <a className={styles.back} href={backHref} aria-label="경기 목록으로">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </a>
      <ul className={styles.teams}>
        {rows.map(({ side, team, batting }) => (
          <li key={side} className={styles.team} data-batting={String(batting)} style={{ '--c': team.color } as CSSProperties}>
            <i className={styles.bar} aria-hidden="true" />
            <b className={styles.name}>{team.name}</b>
            <em className={styles.score}>{team.score}</em>
          </li>
        ))}
      </ul>
      <span className={styles.sep} aria-hidden="true" />
      <span className={styles.inning} aria-label={`${inning}회${half ? '말' : '초'}`}>
        <small aria-hidden="true">{half ? '▼' : '▲'}</small>
        <span aria-hidden="true">{inning}</span>
      </span>
      <BasesGlyph bases={bases} className={styles.bases} />
      <div className={styles.count}>
        <b aria-label={`${balls}볼 ${strikes}스트라이크`}>
          {balls}-{strikes}
        </b>
        <span className={styles.outs} role="img" aria-label={`${outs}아웃`}>
          {[0, 1].map((i) => (
            <i key={i} data-on={String(i < outs)} />
          ))}
        </span>
      </div>
    </div>
  );
}
