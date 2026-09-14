import type { ReactNode } from 'react';
import { formatPct } from '../domain/format';
import { Chip, type ChipTone } from './Chip';
import styles from './TugGauge.module.css';

export interface TugGaugeProps {
  leftLabel: string;
  rightLabel: string;
  /** 왼쪽·오른쪽 확률(0~1). 엔진·selector가 계산한 값을 그대로 받는다 */
  left: number;
  right: number;
  /** 무승부(0~1). null이면 숨긴다(타석·이닝) */
  tie: number | null;
  leftColor: string;
  rightColor: string;
  /** TMI가 없을 때의 왼쪽 값(0~1): 표시선 위치. null이면 없음 */
  ghost: number | null;
  /** TMI 변화 문구(formatDeltaPp). null이면 칩 없음 */
  delta: string | null;
  deltaTone: ChipTone;
  /** 계산 중: "계산 중…"을 알리고 막대는 그대로 둔다 */
  pending?: boolean;
  /** 머리 줄 왼쪽 자리(예: 타석·이닝·경기 Tabs) */
  head?: ReactNode;
  /** 막대 아래 줄: 모드 칩·등급 칩·"TMI 없음 N%" (ADR-009 라벨 자리) */
  children?: ReactNode;
}

const ratio = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
/** 막대 비율(%, 소수 첫째 자리) */
const percent = (x: number) => `${Math.round(ratio(x) * 1000) / 10}%`;

/** "54.0%"의 %만 작게 */
function BigPct({ value }: { value: number }) {
  const text = formatPct(value);
  return (
    <>
      {text.slice(0, -1)}
      <i className={styles.unit}>%</i>
    </>
  );
}

/** 줄다리기 승률 게이지(표시 전용): 좌우 큰 숫자, 가운데 무승부, 12px 막대(왼쪽 팀 색 | 무승부 빗금 | 오른쪽 팀 색)와 TMI 없음 표시선 */
export function TugGauge(props: TugGaugeProps) {
  const { leftLabel, rightLabel, left, right, tie, leftColor, rightColor, ghost, delta, deltaTone, pending = false, head, children } = props;
  const summary = [
    `${leftLabel} ${formatPct(left)}`,
    ...(tie === null ? [] : [`무승부 ${formatPct(tie)}`]),
    `${rightLabel} ${formatPct(right)}`,
    ...(delta === null ? [] : [`TMI 반영 ${delta}`]),
  ].join(', ');
  const showHead = head != null || delta !== null || pending;

  return (
    <div className={styles.gauge} data-pending={pending ? 'true' : 'false'}>
      <span className={styles.srOnly} aria-live="polite">
        {pending ? '계산 중…' : ''}
      </span>

      {showHead ? (
        <div className={styles.head}>
          {head}
          <span className={styles.end} aria-hidden="true">
            {pending ? <span className={styles.status}>계산 중…</span> : null}
            {delta !== null ? (
              <Chip kind="delta" tone={deltaTone}>
                <small>TMI</small>
                <span>{delta}</span>
              </Chip>
            ) : null}
          </span>
        </div>
      ) : null}

      <div role="img" aria-label={summary} className={styles.board}>
        <div className={styles.nums}>
          <div className={styles.side} data-side="left">
            <span className={styles.label}>{leftLabel}</span>
            <b className={styles.big} data-value="">
              <BigPct value={left} />
            </b>
          </div>
          {tie !== null ? (
            <div className={styles.tieSide} data-side="tie">
              <span className={styles.label}>무승부</span>
              <b className={styles.small} data-value="">
                {formatPct(tie)}
              </b>
            </div>
          ) : null}
          <div className={`${styles.side} ${styles.right}`} data-side="right">
            <span className={styles.label}>{rightLabel}</span>
            <b className={styles.big} data-value="">
              <BigPct value={right} />
            </b>
          </div>
        </div>

        <div className={styles.bar} data-bar="">
          <span className={styles.seg} data-seg="left" style={{ flexBasis: percent(left), backgroundColor: leftColor }} />
          {tie !== null ? <span className={`${styles.seg} ${styles.tie}`} data-seg="tie" style={{ flexBasis: percent(tie) }} /> : null}
          <span className={styles.seg} data-seg="right" style={{ flexBasis: percent(right), backgroundColor: rightColor }} />
          {ghost !== null ? <i className={styles.ghost} data-ghost="" style={{ left: percent(ghost) }} /> : null}
        </div>
      </div>

      {children != null ? <div className={styles.foot}>{children}</div> : null}
    </div>
  );
}
