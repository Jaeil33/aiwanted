import { deltaText, type TmiPill } from '../game/broadcast';
import styles from './TmiRail.module.css';
import { trendOfText } from './WpPanel';

export interface RailPill extends TmiPill {
  /** 칩에 보이는 짧은 글(선수 이름을 뗀 문장). 없으면 원문 */
  short?: string;
  /** 이 TMI 하나만 걸었을 때 장면 공격 팀 승리확률 변화(%p 숫자). 계산 중이면 null */
  deltaPp: number | null;
}

export interface TmiRailProps {
  pills: readonly RailPill[];
  /** 칩을 누르면 TMI 시트를 연다 */
  onOpen(): void;
  /** 끝 칩: "+ TMI 걸기" 또는 "↺ 처음부터". 없으면 null */
  action: { label: string; onClick(): void } | null;
}

/** 걸린 TMI 줄(시안 .rail·.pill): 등급 색 점·문장·효과·변화, 끝에 점선 행동 칩. 가로로 넘기면 더 보인다 */
export function TmiRail({ pills, onOpen, action }: TmiRailProps) {
  return (
    <section className={styles.rail} aria-label="걸린 TMI">
      <div className={styles.pills}>
        {pills.map((pill) => {
          const delta = pill.deltaPp === null ? null : deltaText(pill.deltaPp);
          return (
            <button
              key={pill.id}
              type="button"
              className={styles.pill}
              data-tone={pill.tone}
              onClick={onOpen}
              aria-label={`TMI ${pill.text}, ${pill.effect}, ${delta ?? '계산 중'}`}
            >
              <i aria-hidden="true" />
              <span className={styles.text}>{pill.short ?? pill.text}</span>
              <span className={styles.effect}>{pill.effect}</span>
              <b data-trend={delta ? trendOfText(delta) : 'flat'}>{delta ?? '…'}</b>
            </button>
          );
        })}
        {action && (
          <button type="button" className={`${styles.pill} ${styles.add}`} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </section>
  );
}
