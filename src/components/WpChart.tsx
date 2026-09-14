import { formatPct } from '../domain/format';
import styles from './WpChart.module.css';

export interface WpChartProps {
  /** 공격 팀 승리확률(0~1) 흐름 */
  points: Array<{ label: string; value: number }>;
  /** TMI 없음 기준 승리확률 (없으면 null) */
  baseline: number | null;
  teamName: string;
  color: string;
}

/** 그리기 좌표 (viewBox) */
const WIDTH = 320;
const HEIGHT = 150;
const LEFT = 40;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 10;
const TICKS = [0, 0.5, 1];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
const yOf = (v: number) => round2(TOP + (1 - clamp01(v)) * (HEIGHT - TOP - BOTTOM));
const xOf = (i: number, n: number) => round2(n <= 1 ? LEFT : LEFT + (i / (n - 1)) * (WIDTH - LEFT - RIGHT));
/** 31.2%, 100% (소수점 아래가 0이면 뗀다) */
const shortPct = (v: number) => formatPct(clamp01(v)).replace('.0%', '%');

function summaryOf(teamName: string, points: WpChartProps['points']): string {
  if (points.length === 0) return `${teamName} 승리확률 기록 없음`;
  const first = shortPct(points[0].value);
  if (points.length === 1) return `${teamName} 승리확률 ${first}`;
  return `${teamName} 승리확률 ${first}에서 ${shortPct(points[points.length - 1].value)}로`;
}

/** 승리확률 흐름 SVG 차트: 0·50·100% 눈금, 선과 마지막 점 강조, TMI 없음 기준 점선 */
export function WpChart({ points, baseline, teamName, color }: WpChartProps) {
  const summary = summaryOf(teamName, points);
  const n = points.length;
  const coords = points.map((point, i) => ({ x: xOf(i, n), y: yOf(point.value) }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x} ${c.y}`).join(' ');
  const showBaseline = baseline !== null && Number.isFinite(baseline);

  return (
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
      <title>{summary}</title>
      {TICKS.map((tick) => (
        <g key={tick}>
          <line
            className={tick === 0.5 ? styles.mid : styles.grid}
            data-mid={tick === 0.5 ? 'true' : undefined}
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={yOf(tick)}
            y2={yOf(tick)}
          />
          <text className={styles.tick} x={LEFT - 6} y={yOf(tick)} textAnchor="end" dominantBaseline="middle">
            {`${tick * 100}%`}
          </text>
        </g>
      ))}
      {showBaseline && (
        <g>
          <line
            className={styles.baseline}
            data-baseline="true"
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={yOf(baseline)}
            y2={yOf(baseline)}
            strokeDasharray="4 4"
          />
          <text className={styles.baselineLabel} x={WIDTH - RIGHT} y={yOf(baseline) - 4} textAnchor="end">
            TMI 없음
          </text>
        </g>
      )}
      {n >= 2 && <path data-line="true" d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {coords.map((c, i) => {
        const last = i === n - 1;
        return (
          <circle
            key={i}
            className={last ? styles.lastPoint : undefined}
            data-point="true"
            data-last={last ? 'true' : 'false'}
            cx={c.x}
            cy={c.y}
            r={last ? 4.5 : 2.5}
            fill={color}
          />
        );
      })}
    </svg>
  );
}
