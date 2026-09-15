import { deltaText, type TmiPill } from '../game/broadcast';
import styles from './TmiRail.module.css';
import { trendOfText } from './WpPanel';

export interface RailPill extends TmiPill {
  /** 칩에 보이는 짧은 글(선수 이름을 뗀 문장). 없으면 원문 */
  short?: string;
  /** 이 TMI 하나만 걸었을 때 장면 공격 팀 승리확률 변화(%p 숫자). 계산 중이면 null */
  deltaPp: number | null;
}

/** 눌러서 바로 거는 TMI 예시: 칩 글자와 실제로 거는 문장 */
export interface QuickTmi {
  label: string;
  text: string;
}

/** 걸린 TMI가 없을 때 칩 줄 대신 크게 보이는 초대 판 */
export interface TmiInvite {
  /** 큰 판을 누르면 TMI 시트를 연다 */
  onOpen(): void;
  quick: readonly QuickTmi[];
  /** 예시 칩을 누르면 그 문장을 바로 건다 */
  onQuick(text: string): void;
  /** 해석 중이면 예시를 잠근다 */
  busy: boolean;
}

export interface TmiRailProps {
  pills: readonly RailPill[];
  /** 칩을 누르면 TMI 시트를 연다 */
  onOpen(): void;
  /** 맨 앞 칩: "+ TMI 걸기" 또는 "↺ 처음부터". 없으면 null */
  action: { label: string; onClick(): void } | null;
  /** 걸린 TMI가 없고 걸 수 있을 때의 초대 판(ADR-026). 없으면 null */
  invite?: TmiInvite | null;
}

/**
 * 걸린 TMI 줄(시안 .rail·.pill): 등급 색 점·문장·효과·변화. 행동 칩은 가로로 넘기지 않아도 보이게 맨 앞에 둔다.
 * 아직 아무 TMI도 없으면 노란 테두리 초대 판과 "바로 걸기" 예시 칩을 보인다(TMI가 눈에 먼저 들어오게).
 */
export function TmiRail({ pills, onOpen, action, invite = null }: TmiRailProps) {
  if (pills.length === 0 && invite) {
    return (
      <section className={`${styles.rail} ${styles.inviting}`} aria-label="걸린 TMI">
        <button type="button" className={styles.cta} onClick={invite.onOpen} aria-label="TMI 걸기">
          <span className={styles.badge} aria-hidden="true">
            TMI
          </span>
          <span className={styles.ctaText}>
            <b>방금 이 타석에 TMI 걸기</b>
            <small>아무 말이나 쓰면 확률이 바뀌어요</small>
          </span>
          <span className={styles.ctaGo} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>
        <div className={styles.quick} role="group" aria-label="눌러서 바로 걸기">
          <span className={styles.quickLabel} aria-hidden="true">
            바로 걸기
          </span>
          {invite.quick.map((q) => (
            <button key={q.label} type="button" className={styles.quickChip} disabled={invite.busy} onClick={() => invite.onQuick(q.text)}>
              {q.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.rail} aria-label="걸린 TMI">
      <div className={styles.pills}>
        {action && (
          <button
            type="button"
            className={`${styles.pill} ${styles.add}`}
            data-accent={action.label.includes('TMI') ? 'true' : undefined}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
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
      </div>
    </section>
  );
}
