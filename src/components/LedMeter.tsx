import styles from './LedMeter.module.css';

export interface LedMeterProps {
  label: string;
  value: number;
  max: number;
  /** 칸 수. 기본 20 */
  segments?: number;
  /** 보이는 숫자이자 aria-valuetext(예: "38.6") */
  valueText: string;
}

/** LED 미터(예: 승부처 지수): 라벨 · 칸(켜진 칸 --flood, 꺼진 칸 --hair) · 숫자. 켜진 칸 = round(value / max × segments) */
export function LedMeter({ label, value, max, segments = 20, valueText }: LedMeterProps) {
  const count = Number.isFinite(segments) ? Math.max(1, Math.floor(segments)) : 20;
  const valid = Number.isFinite(value) && Number.isFinite(max) && max > 0;
  const on = valid ? Math.min(count, Math.max(0, Math.round((value / max) * count))) : 0;
  const now = valid ? Math.min(max, Math.max(0, value)) : 0;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={valueText}
      className={styles.meter}
    >
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <span className={styles.cells} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {Array.from({ length: count }, (_, index) => (
          <i key={index} className={index < on ? `${styles.cell} ${styles.on}` : styles.cell} data-cell="" data-on={index < on ? 'true' : 'false'} />
        ))}
      </span>
      <b className={styles.value} aria-hidden="true">
        {valueText}
      </b>
    </div>
  );
}
