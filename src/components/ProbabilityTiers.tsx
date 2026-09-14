import { useId } from 'react';
import { EVIDENCE_LABEL, MODE_LABEL, formatPct } from '../domain/format';
import type { TierView } from '../game';
import type { Evidence, Mode } from '../types/domain';
import styles from './ProbabilityTiers.module.css';

export interface ProbabilityTiersProps {
  /** selectTiers 결과 (확률은 엔진 계산값을 옮긴 것) */
  tiers: TierView[];
  mode: Mode;
  /** 걸린 TMI 칩의 근거 등급 (중복 허용) */
  tones: Array<Evidence | 'refused'>;
  pending: boolean;
  batColor: string;
  fldColor: string;
}

const TONE_LABEL: Record<Evidence | 'refused', string> = { ...EVIDENCE_LABEL, refused: '계산 거부' };

const share = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const widthOf = (x: number) => `${Math.round(share(x) * 1000) / 10}%`;

function deltaTone(text: string): 'up' | 'down' | 'flat' {
  if (text.startsWith('+')) return 'up';
  if (text.startsWith('−') || text.startsWith('-')) return 'down';
  return 'flat';
}

/** 3단 승률판: 모드·근거 등급 칩과 타석·이닝·경기 줄. 숫자는 포맷만 하고 계산하지 않는다 */
export function ProbabilityTiers({ tiers, mode, tones, pending, batColor, fldColor }: ProbabilityTiersProps) {
  const titleId = useId();
  const uniqueTones = [...new Set(tones)];

  return (
    <section className={styles.panel} aria-labelledby={titleId} aria-busy={pending}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.panelTitle}>
          승부 확률
        </h2>
        <div className={styles.labels}>
          <span className={mode === 'toon' ? `${styles.chip} ${styles.toon}` : `${styles.chip} ${styles.real}`} data-mode={mode}>
            {MODE_LABEL[mode]}
            {mode === 'toon' && <span className={styles.toonNote}>효과 6배 과장</span>}
          </span>
          {uniqueTones.length > 0 && (
            <ul className={styles.tones} aria-label="근거 등급">
              {uniqueTones.map((tone) => (
                <li key={tone} className={styles.chip} data-tone={tone}>
                  {TONE_LABEL[tone]}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className={styles.status} aria-live="polite">
          {pending ? '계산 중…' : ''}
        </p>
      </div>

      <ol className={styles.rows}>
        {tiers.map((tier) => {
          const left = formatPct(tier.leftValue);
          const right = formatPct(tier.rightValue);
          return (
            <li key={tier.id} className={styles.row} data-tier={tier.id}>
              <div className={styles.rowHead}>
                <h3 className={styles.rowTitle}>{tier.title}</h3>
                <span className={styles.delta} data-tone={deltaTone(tier.deltaText)}>
                  <span className={styles.srOnly}>TMI 반영 차이 </span>
                  {tier.deltaText}
                </span>
              </div>
              <div className={styles.duel}>
                <div className={styles.side}>
                  <span className={styles.sideLabel}>{tier.leftLabel}</span>
                  <span className={styles.value}>{left}</span>
                </div>
                <div className={`${styles.side} ${styles.sideRight}`}>
                  <span className={styles.sideLabel}>{tier.rightLabel}</span>
                  <span className={styles.value}>{right}</span>
                </div>
              </div>
              <div className={styles.bar} role="img" aria-label={`${tier.leftLabel} ${left}, ${tier.rightLabel} ${right}`}>
                <span className={styles.fill} data-side="left" style={{ width: widthOf(tier.leftValue), backgroundColor: batColor }} />
                <span className={styles.fill} data-side="right" style={{ width: widthOf(tier.rightValue), backgroundColor: fldColor }} />
              </div>
              {tier.extra && <p className={styles.extra}>{tier.extra}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
