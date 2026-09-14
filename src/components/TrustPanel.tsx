import { useId } from 'react';
import { formatPct } from '../domain/format';
import type { TrustData } from '../types/data';
import styles from './TrustPanel.module.css';

type ModelKey = keyof TrustData['brier'];

/** 비교하는 세 예측: 막대·표 순서 */
const MODELS: ReadonlyArray<{ key: ModelKey; label: string; className: string }> = [
  { key: 'engine', label: 'TMI 야구 엔진', className: styles.engine },
  { key: 'naver', label: '네이버 승리확률', className: styles.naver },
  { key: 'constant', label: '항상 50%', className: styles.constant },
];

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');
const round1 = (v: number) => Math.round(v * 10) / 10;
const fixed3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const formatCount = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—');

/** 막대 폭: 세 값 중 가장 큰 값을 100%로 (0 이하·숫자 아님은 0%) */
function barWidths(values: number[]): string[] {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  const max = positive.length > 0 ? Math.max(...positive) : 0;
  return values.map((v) => (max > 0 && Number.isFinite(v) && v > 0 ? `${Math.round((Math.min(v / max, 1) * 1000)) / 10}%` : '0%'));
}

/* 보정 차트 좌표: 정사각형 그림 영역 + 축 라벨 여백 */
const PLOT = 220;
const LEFT = 60;
const TOP = 12;
const RIGHT = 16;
const BOTTOM = 52;
const WIDTH = LEFT + PLOT + RIGHT;
const HEIGHT = TOP + PLOT + BOTTOM;
const TICKS = [0, 0.5, 1];
const R_MIN = 3;
const R_MAX = 10;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const xOf = (p: number) => round1(LEFT + clamp01(p) * PLOT);
const yOf = (a: number) => round1(TOP + (1 - clamp01(a)) * PLOT);
const tickLabel = (t: number) => `${Math.round(t * 100)}%`;

type Bin = TrustData['calibration'][number];

const isBin = (b: unknown): b is Bin =>
  typeof b === 'object' && b !== null && Number.isFinite((b as Bin).predicted) && Number.isFinite((b as Bin).actual);

/** 대각선(완벽한 보정)과 구간별 점: x = 예측 평균, y = 실제 홈 승률, 넓이 ∝ n */
function CalibrationChart({ bins }: { bins: TrustData['calibration'] }) {
  const valid = bins.filter(isBin);
  const maxN = Math.max(0, ...valid.map((b) => (Number.isFinite(b.n) ? b.n : 0)));
  const radius = (n: number) => (maxN > 0 && Number.isFinite(n) && n > 0 ? R_MIN + (R_MAX - R_MIN) * Math.sqrt(n / maxN) : R_MIN);
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="보정 차트: 엔진이 예측한 홈 승률(가로)과 실제 홈 승률(세로)"
    >
      <rect className={styles.frame} x={LEFT} y={TOP} width={PLOT} height={PLOT} />
      <line className={styles.grid} x1={xOf(0.5)} y1={TOP} x2={xOf(0.5)} y2={TOP + PLOT} />
      <line className={styles.grid} x1={LEFT} y1={yOf(0.5)} x2={LEFT + PLOT} y2={yOf(0.5)} />
      <line className={styles.diagonal} data-diagonal="true" x1={xOf(0)} y1={yOf(0)} x2={xOf(1)} y2={yOf(1)} />
      {TICKS.map((t) => (
        <text key={`x-${t}`} className={styles.tick} x={xOf(t)} y={TOP + PLOT + 18} textAnchor="middle">
          {tickLabel(t)}
        </text>
      ))}
      {TICKS.map((t) => (
        <text key={`y-${t}`} className={styles.tick} x={LEFT - 8} y={yOf(t) + 4} textAnchor="end">
          {tickLabel(t)}
        </text>
      ))}
      <text className={styles.axisTitle} x={LEFT + PLOT / 2} y={HEIGHT - 8} textAnchor="middle">
        엔진이 예측한 홈 승률
      </text>
      <text className={styles.axisTitle} transform={`translate(16 ${TOP + PLOT / 2}) rotate(-90)`} textAnchor="middle">
        실제 홈 승률
      </text>
      {valid.map((b, i) => (
        <circle key={i} className={styles.point} data-point={i} cx={xOf(b.predicted)} cy={yOf(b.actual)} r={round1(radius(b.n))}>
          <title>{`예측 ${formatPct(b.predicted)} · 실제 ${formatPct(b.actual)} · ${formatCount(b.n)}타석`}</title>
        </circle>
      ))}
    </svg>
  );
}

export interface TrustPanelProps {
  trust: TrustData | null;
}

/** 엔진 신뢰도 리포트: 적용 범위, Brier 막대, 로그 손실 표, 보정 차트, note. 숫자는 trust.json 값만 쓴다 */
export function TrustPanel({ trust }: TrustPanelProps) {
  const brierTitleId = useId();
  if (!trust) return <p className={styles.empty}>엔진 신뢰도 리포트가 아직 없어요.</p>;

  const brier = MODELS.map((model) => trust.brier[model.key]);
  const widths = barWidths(brier);
  return (
    <div className={styles.panel}>
      <p className={styles.lead}>
        {`2025 시즌 기록만으로 만든 엔진을 2026년 8월 1일~9월 13일 중계 타석에 적용했어요(${formatCount(trust.games)}경기 · ${formatCount(trust.plateAppearances)}타석). 타석마다 엔진이 예측한 홈팀 승리확률을 실제 승패와 비교해요.`}
      </p>

      <div className={styles.block}>
        <h4 id={brierTitleId} className={styles.blockTitle}>
          Brier 점수
        </h4>
        <p className={styles.hint}>낮을수록 정확해요</p>
        <ul className={styles.bars} aria-labelledby={brierTitleId}>
          {MODELS.map((model, i) => (
            <li key={model.key} className={styles.bar}>
              <span className={styles.barLabel}>{model.label}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={cx(styles.fill, model.className)} data-fill={model.key} style={{ width: widths[i] }} />
              </span>
              <span className={styles.value}>{fixed3(brier[i])}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>로그 손실</caption>
          <thead>
            <tr>
              <th scope="col">예측 방법</th>
              <th scope="col">값</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((model) => (
              <tr key={model.key}>
                <th scope="row">{model.label}</th>
                <td>{fixed3(trust.logLoss[model.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.block}>
        <h4 className={styles.blockTitle}>보정 차트</h4>
        <figure className={styles.figure}>
          <CalibrationChart bins={trust.calibration} />
          <figcaption className={styles.figcaption}>
            점선 대각선에 가까울수록 엔진이 예측한 승률만큼 실제로 이겼다는 뜻이에요. 점이 클수록 그 구간의 타석이 많아요.
          </figcaption>
        </figure>
      </div>

      {typeof trust.note === 'string' && <p className={styles.note}>{trust.note}</p>}
    </div>
  );
}
