import { TEAMS, isTeamCode } from '../domain/teams';
import type { SceneRecord } from '../types/data';
import styles from './SceneCard.module.css';

/** 승부처 지수 막대의 꽉 찬 값(leverage %p). 넘으면 100%로 자른다 */
const LEVERAGE_FULL = 60;

/** 장면 날짜 "8월 25일" (YYYY-MM-DD가 아니면 그대로) */
export function formatSceneDate(date: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[1])}월 ${Number(match[2])}일` : date;
}

const teamColor = (code: string) => (isTeamCode(code) ? TEAMS[code].color : 'var(--chalk-3)');

export interface SceneCardProps {
  scene: SceneRecord;
  /** 있으면 카드 전체가 그 주소로 가는 링크 */
  href?: string;
}

/** 장면 카드: 날짜·구장·장면 시점 점수·상황 문장·승부처 지수. 실제 결과·최종 점수는 보여주지 않는다(PRD) */
export function SceneCard({ scene, href }: SceneCardProps) {
  const leverage = Number.isFinite(scene.leverage) ? Math.min(Math.max(scene.leverage, 0), LEVERAGE_FULL) : 0;
  const percent = Math.round((leverage / LEVERAGE_FULL) * 1000) / 10;
  const body = (
    <>
      <span className={styles.meta}>
        <time dateTime={scene.date}>{formatSceneDate(scene.date)}</time>
        <span aria-hidden="true">·</span>
        <span>{scene.stadium}</span>
      </span>
      <span className={styles.teams}>
        <span className={styles.swatch} style={{ backgroundColor: teamColor(scene.away.code) }} aria-hidden="true" data-team="away" />
        <span className={styles.score}>{`${scene.away.name} ${scene.state.away} : ${scene.state.home} ${scene.home.name}`}</span>
        <span className={styles.swatch} style={{ backgroundColor: teamColor(scene.home.code) }} aria-hidden="true" data-team="home" />
      </span>
      <span className={styles.title}>{scene.title}</span>
      <span className={styles.leverage}>
        <span className={styles.leverageLabel}>승부처 지수</span>
        <span className={styles.track} role="img" aria-label={`승부처 지수 ${Math.round(percent)}점(100점 만점)`}>
          <span className={styles.fill} style={{ width: `${percent}%` }} />
        </span>
      </span>
    </>
  );
  return href ? (
    <a className={styles.card} href={href}>
      {body}
    </a>
  ) : (
    <div className={styles.card}>{body}</div>
  );
}
