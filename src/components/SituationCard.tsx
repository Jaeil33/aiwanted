import type { CSSProperties } from 'react';
import { situationText } from '../domain/format';
import { TEAMS, isTeamCode } from '../domain/teams';
import type { SceneRecord } from '../types/data';
import { BasesGlyph } from './BroadcastBug';
import styles from './SituationCard.module.css';

const WEEKDAYS = '일월화수목금토';

/** YYYY-MM-DD의 요일 한 글자. 틀린 날짜면 빈 문자열 */
export function weekdayOf(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return '';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
  return WEEKDAYS[t.getUTCDay()];
}

const shortDate = (date: string) => {
  const [, m, d] = date.split('-');
  const day = weekdayOf(date);
  return `${Number(m)}.${Number(d)}${day ? ` (${day})` : ''}`;
};

const colorOf = (code: string) => (isTeamCode(code) ? TEAMS[code].color : '#A3ADB8');

export interface SituationCardProps {
  scene: SceneRecord;
  batterName: string;
  pitcherName: string;
  href: string;
  variant?: 'row' | 'feature';
}

/** 지난 경기 타석 카드: 날짜·구장, 그 순간 점수(공격 팀 표시), 상황·주자, 타자 vs 투수. 실제 결과는 싣지 않는다 */
export function SituationCard({ scene, batterName, pitcherName, href, variant = 'row' }: SituationCardProps) {
  const { state } = scene;
  const rows = [
    { side: 'away', name: scene.away.name, code: scene.away.code, score: state.away, batting: state.half === 0 },
    { side: 'home', name: scene.home.name, code: scene.home.code, score: state.home, batting: state.half === 1 },
  ] as const;
  return (
    <a
      className={styles.card}
      data-variant={variant}
      href={href}
      style={{ '--away': colorOf(scene.away.code), '--home': colorOf(scene.home.code) } as CSSProperties}
    >
      <div className={styles.meta}>
        {variant === 'feature' && <span className={styles.kicker}>오늘의 타석</span>}
        <span className={styles.date}>{shortDate(scene.date)}</span>
        <span className={styles.stadium}>{scene.stadium}</span>
      </div>
      <ul className={styles.teams}>
        {rows.map((row) => (
          <li key={row.side} className={styles.team} data-batting={String(row.batting)} style={{ '--c': colorOf(row.code) } as CSSProperties}>
            <i className={styles.bar} aria-hidden="true" />
            <span className={styles.name}>{row.name}</span>
            <em className={styles.score}>{row.score}</em>
          </li>
        ))}
      </ul>
      <div className={styles.state}>
        <span className={styles.situation}>{situationText(state)}</span>
        <BasesGlyph bases={state.bases} className={styles.bases} />
      </div>
      <p className={styles.matchup}>
        <span className={styles.role}>타자</span>
        <b>{batterName}</b>
        <span className={styles.vs} aria-hidden="true">
          vs
        </span>
        <span className={styles.role}>투수</span>
        <b>{pitcherName}</b>
      </p>
      {variant === 'feature' && <span className={styles.cta}>이 타석에 TMI 걸기</span>}
    </a>
  );
}
