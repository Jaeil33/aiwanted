import styles from './Sparkline.module.css';

export interface SparklineProps {
  /** 0~1 값, 시간 순 */
  values: readonly number[];
  className?: string;
}

const W = 112;
const H = 34;
const f = (n: number) => n.toFixed(1);

/** 추이선 112×34(시안 .spark): 첫 값 높이 점선, 금색 선, 마지막 값 점 */
export function Sparkline({ values, className }: SparklineProps) {
  const vals = values.filter((v) => Number.isFinite(v));
  const cls = [styles.spark, className].filter(Boolean).join(' ');
  if (vals.length === 0) return <svg className={cls} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const lo = Math.min(...vals) - 0.03;
  const hi = Math.max(...vals) + 0.03;
  const x = (i: number) => (vals.length === 1 ? W - 4 : 4 + (i * (W - 8)) / (vals.length - 1));
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const last = vals.length - 1;
  return (
    <svg className={cls} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className={styles.base} x1="0" x2={W} y1={f(y(vals[0]))} y2={f(y(vals[0]))} strokeDasharray="2 3" />
      {vals.length > 1 && <polyline className={styles.line} points={vals.map((v, i) => `${f(x(i))},${f(y(v))}`).join(' ')} />}
      <circle className={styles.dot} cx={f(x(last))} cy={f(y(vals[last]))} r="3" />
    </svg>
  );
}
