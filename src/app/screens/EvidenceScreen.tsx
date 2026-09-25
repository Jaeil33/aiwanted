import { EvidenceTable, VERDICT_LABEL, formatSigned, isBaseline } from '../../components/EvidenceTable';
import { TrustPanel } from '../../components/TrustPanel';
import type { EvidenceData } from '../../types/data';
import type { Verdict } from '../../types/domain';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import styles from './EvidenceScreen.module.css';

const INTRO =
  '기온·바람·이동 거리처럼 기록에 남는 변수는 2021~2025년 경기로 효과를 재고, 2026년 경기로 정말 맞는지 확인했어요. ' +
  '기록에서 효과가 보여도 다음 해 경기 예측까지 좋아지는지는 따로 확인해요.';

const VERDICTS: readonly Verdict[] = ['real', 'maybe', 'useless'];

const formatCount = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—');

/** 시즌 목록을 범위로: "2021~2025", 한 시즌이면 "2025" */
function seasonSpan(seasons: number[]): string {
  const valid = seasons.filter((s) => Number.isFinite(s));
  if (valid.length === 0) return '—';
  const first = Math.min(...valid);
  const last = Math.max(...valid);
  return first === last ? `${first}` : `${first}~${last}`;
}

/** 전체 변수 검증 개선 구간을 판정 규칙(구간 하한 > 0)과 같은 기준으로 읽는다 */
function jointReading(joint: EvidenceData['joint'], season: number): string {
  if (joint.ciLow > 0) return `전체 변수를 함께 넣으면 ${season} 경기 예측이 좋아졌어요.`;
  if (joint.ciHigh < 0) return `전체 변수를 함께 넣으면 ${season} 경기 예측이 오히려 나빠졌어요.`;
  return `전체 변수를 함께 넣어도 ${season} 경기 예측이 좋아졌다고 말할 수 없어요.`;
}

/** 기준점(home)을 뺀 items의 판정 개수: "진짜 효과 N개 · 애매해요 N개 · 쓸모없음 N개" */
function verdictSummary(items: EvidenceData['items']): string {
  const counts: Record<Verdict, number> = { real: 0, maybe: 0, useless: 0 };
  for (const item of items) {
    if (isBaseline(item) || !VERDICTS.includes(item.verdict)) continue;
    counts[item.verdict] += 1;
  }
  return VERDICTS.map((verdict) => `${VERDICT_LABEL[verdict]} ${counts[verdict]}개`).join(' · ');
}

/** 판정 방법: method 문단, 학습·검증 경기 수, 전체 변수를 함께 넣었을 때의 검증 개선량 */
function MethodSection({ evidence }: { evidence: EvidenceData }) {
  const { games, joint, testSeason } = evidence;
  return (
    <section className={styles.section} aria-labelledby="evidence-method-title">
      <h3 id="evidence-method-title" className={styles.sectionTitle}>
        어떻게 판정했나
      </h3>
      <p className={styles.method}>{evidence.method}</p>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>학습</dt>
          <dd className={styles.factValue}>{`${seasonSpan(evidence.trainSeasons)} 시즌 ${formatCount(games.train)}경기`}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>검증</dt>
          <dd className={styles.factValue}>{`${testSeason} 시즌 ${formatCount(games.test)}경기`}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{`전체 변수를 함께 넣었을 때 ${testSeason} 예측 개선`}</dt>
          <dd className={styles.factValue}>
            {`경기당 이탈도 ${formatSigned(joint.devianceGainPerGame, 4)} (95% 구간 ${formatSigned(joint.ciLow, 4)} ~ ${formatSigned(joint.ciHigh, 4)})`}
          </dd>
        </div>
      </dl>
      <p className={styles.reading}>{jointReading(joint, testSeason)}</p>
    </section>
  );
}

/** 판정소: 실측 변수 판정(evidence.json)과 엔진 신뢰도(trust.json). 파일이 없으면 각 컴포넌트가 안내한다 */
export function EvidenceScreen() {
  const { data, session } = useGame();
  const { evidence, trust } = data;
  const backHref =
    session.situation === null ? formatRoute({ screen: 'home' }) : formatRoute({ screen: 'play', sceneId: session.situation.id, share: null });

  return (
    <div className={styles.screen}>
      <section className={styles.intro} aria-labelledby="evidence-title">
        <h2 id="evidence-title" className={styles.title}>
          판정소
        </h2>
        {/* 첫 화면 제목과 같은 문구: "진짜"만 강조해 전체 문구가 한 텍스트로 겹치지 않게 한다(첫 화면 찾기 테스트가 헷갈리지 않게) */}
        <p className={styles.subtitle}>
          쓸모없는 변수, <em className={styles.emphasis}>진짜</em> 쓸모없을까?
        </p>
        <p className={styles.lead}>{INTRO}</p>
      </section>

      {evidence && <MethodSection evidence={evidence} />}

      <section className={styles.section} aria-labelledby="evidence-table-title">
        <h3 id="evidence-table-title" className={styles.sectionTitle}>
          변수별 판정
        </h3>
        {evidence && <p className={styles.summary}>{verdictSummary(evidence.items)}</p>}
        <EvidenceTable evidence={evidence} />
      </section>

      <section className={styles.section} aria-labelledby="evidence-trust-title">
        <h3 id="evidence-trust-title" className={styles.sectionTitle}>
          엔진은 믿을 만한가
        </h3>
        <TrustPanel trust={trust} />
      </section>

      <a className={styles.back} href={backHref}>
        장면으로 돌아가기
      </a>
    </div>
  );
}
