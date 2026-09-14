import { MEASURED } from '../domain/measured';
import type { EvidenceData, EvidenceItem } from '../types/data';
import type { MeasuredDef, Verdict } from '../types/domain';
import styles from './EvidenceTable.module.css';

/** 판정 칩 문구 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  real: '진짜 효과',
  maybe: '애매해요',
  useless: '쓸모없음',
};

const MINUS = '−';

/** 기준점 변수: TMI로 걸지 않고 다른 효과와 견주는 참고용(ADR-004 "(참고용) 홈") */
const BASELINE_ID = 'home';

/** 기준점(home) 행인가. 표 맨 아래에 두고 판정 요약 개수에서 뺀다 */
export function isBaseline(item: Pick<EvidenceItem, 'id'>): boolean {
  return item.id === BASELINE_ID;
}

/** 부호를 붙인 고정 소수: "+2.1", "−0.4"(U+2212), 반올림해 0이면 "±0.0". 유한한 숫자가 아니면 "—" */
export function formatSigned(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toFixed(digits);
  if (Number(abs) === 0) return `±${abs}`;
  return `${value > 0 ? '+' : MINUS}${abs}`;
}

const formatPctChange = (pct: number) => (Number.isFinite(pct) ? `${formatSigned(pct, 1)}%` : '—');

/** 로그 득점 배수 → 득점 변화 % (runsPctPerUnit과 같은 변환) */
const runsPct = (logRuns: number) => (Math.exp(logRuns) - 1) * 100;

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');
const round2 = (v: number) => Math.round(v * 100) / 100;

const isVerdict = (v: unknown): v is Verdict => v === 'real' || v === 'maybe' || v === 'useless';

const VERDICT_CLASS: Record<Verdict, string> = {
  real: styles.real,
  maybe: styles.maybe,
  useless: styles.useless,
};

const DEFS = new Map<string, MeasuredDef>(MEASURED.map((def) => [def.id, def] as const));

/** 표 순서: 적용 가능한 변수(파일 순서) → 정의가 없거나 적용하지 않는 변수 → 기준점 */
function rank(item: EvidenceItem): number {
  if (isBaseline(item)) return 2;
  return DEFS.get(item.id)?.applicable ? 0 : 1;
}

/* 95% 구간 막대: 가로축 −10%~+10%, 0 기준선. 구간이 축 밖으로 나가면 그 끝에 화살표 */
const AXIS_MIN = -10;
const AXIS_MAX = 10;
const BAR_WIDTH = 132;
const BAR_HEIGHT = 18;
const BAR_PAD = 8;
const MID = BAR_HEIGHT / 2;
const AXIS_HEIGHT = 14;

function xOf(pct: number): number {
  const clamped = Math.min(Math.max(pct, AXIS_MIN), AXIS_MAX);
  return round2(BAR_PAD + ((clamped - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * (BAR_WIDTH - 2 * BAR_PAD));
}

/** 머리 칸의 축 라벨 (막대와 같은 폭·좌표) */
function AxisScale() {
  return (
    <svg className={styles.axis} width={BAR_WIDTH} height={AXIS_HEIGHT} viewBox={`0 0 ${BAR_WIDTH} ${AXIS_HEIGHT}`} aria-hidden="true">
      <text className={styles.axisLabel} x={0} y={AXIS_HEIGHT - 3} textAnchor="start">
        {`${formatSigned(AXIS_MIN, 0)}%`}
      </text>
      <text className={styles.axisLabel} x={xOf(0)} y={AXIS_HEIGHT - 3} textAnchor="middle">
        0
      </text>
      <text className={styles.axisLabel} x={BAR_WIDTH} y={AXIS_HEIGHT - 3} textAnchor="end">
        {`${formatSigned(AXIS_MAX, 0)}%`}
      </text>
    </svg>
  );
}

/** 학습 95% 구간(ciLow·ciHigh → 득점 변화 %) 막대와 추정값 점. 구간 값이 숫자가 아니면 그리지 않는다 */
function CiBar({ item }: { item: EvidenceItem }) {
  const a = runsPct(item.ciLow);
  const b = runsPct(item.ciHigh);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const left = xOf(lo);
  const right = xOf(hi);
  const zero = xOf(0);
  const edge = BAR_WIDTH - BAR_PAD;
  const point = item.runsPctPerUnit;
  const showPoint = Number.isFinite(point) && point >= AXIS_MIN && point <= AXIS_MAX;
  return (
    <svg
      className={styles.ci}
      width={BAR_WIDTH}
      height={BAR_HEIGHT}
      viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
      role="img"
      aria-label={`95% 구간 ${formatPctChange(lo)} ~ ${formatPctChange(hi)}`}
    >
      <line className={styles.ciTrack} x1={BAR_PAD} y1={MID} x2={edge} y2={MID} />
      <rect className={styles.ciBar} data-ci="interval" x={left} y={MID - 3} width={round2(Math.max(right - left, 2))} height={6} />
      <line className={styles.ciZero} data-zero="zero" x1={zero} y1={1} x2={zero} y2={BAR_HEIGHT - 1} />
      {showPoint && <circle className={styles.ciPoint} cx={xOf(point)} cy={MID} r={3} />}
      {lo < AXIS_MIN && (
        <polygon className={styles.ciArrow} data-arrow="low" points={`${BAR_PAD},${MID - 5} 1,${MID} ${BAR_PAD},${MID + 5}`} />
      )}
      {hi > AXIS_MAX && (
        <polygon className={styles.ciArrow} data-arrow="high" points={`${edge},${MID - 5} ${BAR_WIDTH - 1},${MID} ${edge},${MID + 5}`} />
      )}
    </svg>
  );
}

function Row({ item, testSeason }: { item: EvidenceItem; testSeason: number }) {
  const def = DEFS.get(item.id);
  const improved = item.test.ciLow > 0;
  const pct = item.runsPctPerUnit;
  return (
    <tr>
      <th scope="row" className={styles.variable}>
        <span className={styles.label}>{def?.label ?? item.id}</span>
        {def && <span className={styles.per}>{def.perLabel}</span>}
        {isBaseline(item) && <span className={cx(styles.chip, styles.baseline)}>기준점</span>}
      </th>
      <td>
        <span className={cx(styles.pct, !Number.isFinite(pct) && styles.missing)}>{formatPctChange(pct)}</span>
        <CiBar item={item} />
      </td>
      <td>
        <span className={cx(styles.chip, improved ? styles.improved : styles.notImproved)}>
          {`${testSeason} 예측 개선 ${improved ? '있음' : '없음'}`}
        </span>
      </td>
      <td>
        {isVerdict(item.verdict) ? (
          <span className={cx(styles.chip, VERDICT_CLASS[item.verdict])}>{VERDICT_LABEL[item.verdict]}</span>
        ) : (
          <span className={styles.missing}>—</span>
        )}
      </td>
      <td className={styles.note}>{typeof item.note === 'string' ? item.note : null}</td>
    </tr>
  );
}

export interface EvidenceTableProps {
  evidence: EvidenceData | null;
}

/** 실측 변수 판정표: 변수·득점 변화와 95% 구간 막대·검증 칩·판정 칩·설명. 숫자는 evidence.json 값만 쓴다 */
export function EvidenceTable({ evidence }: EvidenceTableProps) {
  if (!evidence) {
    return <p className={styles.empty}>판정 데이터가 아직 없어요. 파이프라인으로 evidence.json을 만들면 보여요.</p>;
  }
  const rows = [...evidence.items].sort((a, b) => rank(a) - rank(b));
  return (
    <div className={styles.scroll} role="region" aria-label="실측 변수 판정표" tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.caption}>득점 변화는 팀 득점 기준, 막대는 95% 구간</caption>
        <thead>
          <tr>
            <th scope="col">변수</th>
            <th scope="col">
              <span className={styles.headLabel}>득점 변화</span>
              <AxisScale />
            </th>
            <th scope="col">{`${evidence.testSeason} 검증`}</th>
            <th scope="col">판정</th>
            <th scope="col">설명</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <Row key={`${item.id}-${i}`} item={item} testSeason={evidence.testSeason} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
