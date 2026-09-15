import { EVIDENCE_LABEL, formatPct } from '../domain/format';
import { TIER_LABEL, deltaText, type Tier, type TierReadout } from '../game/broadcast';
import type { Evidence, Mode } from '../types/domain';
import { Sparkline } from './Sparkline';
import { WinBar } from './WinBar';
import styles from './WpPanel.module.css';

export interface WpPanelProps {
  /** null이면 계산 중 */
  readout: TierReadout | null;
  tier: Tier;
  onTier(tier: Tier): void;
  mode: Mode;
  onMode(mode: Mode): void;
  /** 공을 던진 뒤에는 모드를 바꿀 수 없다 */
  modeLocked: boolean;
  hasTmi: boolean;
  grade: Evidence | null;
  /** 추이선 값 */
  spark: readonly number[];
}

const TIERS: readonly Tier[] = ['game', 'inning', 'pa'];
const MODE_SUB: Record<Mode, string> = { real: '현실 모드', toon: '만화 모드 · 효과 6배 과장' };

/** 부호로 고른 변화 방향(시안 .delta up·down·flat) */
export function trendOfText(text: string): 'up' | 'down' | 'flat' {
  return text.startsWith('+') ? 'up' : text.startsWith('−') ? 'down' : 'flat';
}

/** 승부 확률 판(시안 .wp): 경기·이닝·타석 탭 + 현실·만화 ×6, 라벨·58px 숫자, TMI 변화·추이선, 승률 막대, 보조 줄 */
export function WpPanel({ readout, tier, onTier, mode, onMode, modeLocked, hasTmi, grade, spark }: WpPanelProps) {
  const top = (
    <div className={styles.top}>
      <div className={styles.seg} role="tablist" aria-label="확률 단위">
        {TIERS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tier} onClick={() => onTier(t)}>
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>
      <div className={styles.mode} role="radiogroup" aria-label="모드">
        <button type="button" role="radio" data-mode="real" aria-checked={mode === 'real'} disabled={modeLocked} onClick={() => onMode('real')}>
          현실
        </button>
        <button type="button" role="radio" data-mode="toon" aria-checked={mode === 'toon'} disabled={modeLocked} onClick={() => onMode('toon')}>
          만화 ×6
        </button>
      </div>
    </div>
  );

  if (!readout) {
    return (
      <section className={styles.wp} aria-label="승부 확률" aria-busy="true">
        {top}
        <p className={styles.pending}>계산 중…</p>
      </section>
    );
  }

  const delta = deltaText(readout.deltaPp);
  const { bar } = readout;
  // 막대 설명: 큰 숫자 라벨과 겹치지 않게 막대의 세 구간(경기) 또는 두 구간(이닝·타석)을 모두 읽는다
  const barLabel = [
    `${readout.label} ${formatPct(readout.value)}`,
    ...(readout.tier === 'game' ? [`무승부 ${formatPct(bar.tie)}`] : []),
    `${readout.rightLabel} ${formatPct(bar.right)}`,
  ].join(' · ');
  const subParts = [...readout.sub, MODE_SUB[mode]].join(' · ');

  return (
    <section className={styles.wp} aria-label="승부 확률">
      {top}
      <div className={styles.main}>
        <div className={styles.lead}>
          <div className={styles.labelRow}>
            <p className={styles.label}>{readout.label}</p>
            {hasTmi && grade && (
              <span className={styles.grade} data-grade={grade}>
                {EVIDENCE_LABEL[grade]}
              </span>
            )}
          </div>
          <p key={readout.value.toFixed(4)} className={styles.num} aria-label={`${readout.label} ${formatPct(readout.value)}`}>
            {(readout.value * 100).toFixed(1)}
            <small>%</small>
          </p>
        </div>
        <div className={styles.side}>
          {hasTmi && (
            <span className={styles.delta} data-trend={trendOfText(delta)}>
              <small>TMI</small>
              <span>{delta}</span>
            </span>
          )}
          <Sparkline values={spark} />
        </div>
      </div>
      <WinBar className={styles.bar} {...bar} label={barLabel} />
      <p className={styles.sub}>
        {hasTmi && (
          <>
            TMI 없이 <b>{formatPct(readout.base)}</b>
            {' · '}
          </>
        )}
        {subParts}
      </p>
    </section>
  );
}
