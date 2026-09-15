import { EVIDENCE_LABEL } from '../domain/format';
import { KNOB_META, SUBJECT_LABEL } from '../domain/knobs';
import { MEASURED } from '../domain/measured';
import { gradeOf } from '../game/headline';
import type { EffectPart, Subject, TmiEntry, VerdictResult } from '../types/domain';
import controls from './controls.module.css';
import styles from './TmiCard.module.css';

/** 손잡이 대상의 화면 이름(시안 "이용준 · 경기 내내"). 없으면 "투수" 같은 역할 이름 */
export interface CardNames {
  batter: string;
  pitcher: string;
  battingTeam: string;
  fieldingTeam: string;
}

export interface TmiCardProps {
  entry: TmiEntry;
  names?: CardNames;
  verdict: VerdictResult | null;
  judging: boolean;
  canRemove: boolean;
  onRemove(): void;
  onJudge(): void;
}

const VERDICT_LABEL: Record<VerdictResult['verdict'], string> = {
  real: '진짜 효과',
  maybe: '애매해요',
  useless: '쓸모없음',
  unmeasurable: '잴 수 없음',
};

const SCOPE_LABEL = { pa: '이번 타석', game: '경기 내내' } as const;
const PIPS = [-3, -2, -1, 0, 1, 2, 3];
const MEASURED_BY_ID = new Map(MEASURED.map((def) => [def.id, def] as const));
const formatValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function subjectName(subject: Subject, names: CardNames | undefined): string {
  const role = Object.hasOwn(SUBJECT_LABEL, subject) ? SUBJECT_LABEL[subject] : String(subject);
  if (!names || subject === 'everyone') return role;
  return names[subject] || role;
}

function PartRow({ part, names }: { part: EffectPart; names?: CardNames }) {
  if (part.kind === 'measured') {
    const def = MEASURED_BY_ID.get(part.variable);
    const label = def ? def.label : String(part.variable);
    const value = !def ? formatValue(part.value) : def.transform.kind === 'indicator' ? (part.value !== 0 ? '해당' : '해당 없음') : `${formatValue(part.value)}${def.unit}`;
    return (
      <li className={styles.part} data-dir="measured">
        <span className={styles.icon} aria-hidden="true">
          ≈
        </span>
        <div className={styles.partText}>
          <b>{label}</b>
          <small>{value}</small>
        </div>
        <span className={styles.measuredTag}>기록 변수</span>
      </li>
    );
  }
  const strength = Math.max(-3, Math.min(3, Math.round(part.strength)));
  const up = strength > 0;
  const knobName = Object.hasOwn(KNOB_META, part.knob) ? KNOB_META[part.knob].label : String(part.knob);
  // 선수 손잡이는 "투수 체력"처럼 역할을 붙이고, 팀·환경 손잡이는 이름만
  const knob = part.subject === 'batter' || part.subject === 'pitcher' ? `${SUBJECT_LABEL[part.subject]} ${knobName}` : knobName;
  const subject = subjectName(part.subject, names);
  const scope = part.scope === 'pa' ? SCOPE_LABEL.pa : SCOPE_LABEL.game;
  return (
    <li className={styles.part} data-dir={up ? 'up' : 'down'}>
      <span className={styles.icon} aria-hidden="true">
        {up ? '↑' : '↓'}
      </span>
      <div className={styles.partText}>
        <b>{knob}</b>
        <small>{`${subject} · ${scope}`}</small>
      </div>
      <span className={styles.pips} role="img" aria-label={`세기 ${up ? '+' : '−'}${Math.abs(strength)}`}>
        {PIPS.map((v) => {
          const on = up ? v > 0 && v <= strength : v < 0 && v >= strength;
          return <i key={v} data-kind={v === 0 ? 'mid' : on ? (up ? 'pos' : 'neg') : 'off'} />;
        })}
      </span>
    </li>
  );
}

/** TMI 카드: 출처·등급 → 인용 → 손잡이·실측 행 → 이유와 "진짜야?" → 판정. 거부면 --out 테두리와 이유 */
export function TmiCard({ entry, names, verdict, judging, canRemove, onRemove, onJudge }: TmiCardProps) {
  const { interpretation } = entry;
  const refused = interpretation.refused;
  const grade = refused ? null : gradeOf([entry]);
  const note = interpretation.comment || interpretation.parts.find((part) => part.why.trim() !== '')?.why || '';
  return (
    <article className={styles.card} aria-label={`TMI ${entry.text}`} data-refused={String(refused)}>
      <header className={styles.head}>
        <span className={styles.source}>{interpretation.source === 'ai' ? 'AI 해석' : '규칙 해석'}</span>
        {refused ? (
          <span className={styles.refusedChip}>계산 안 함</span>
        ) : (
          grade && (
            <span className={styles.grade} data-grade={grade}>
              {EVIDENCE_LABEL[grade]}
            </span>
          )
        )}
        {canRemove && (
          <button type="button" className={styles.remove} onClick={onRemove} aria-label={`“${entry.text}” 빼기`}>
            빼기
          </button>
        )}
      </header>
      <p className={styles.quote}>{`“${entry.text}”`}</p>
      {refused ? (
        <p className={styles.reason}>{interpretation.reason}</p>
      ) : (
        interpretation.parts.length > 0 && (
          <ul className={styles.parts}>
            {interpretation.parts.map((part, index) => (
              <PartRow key={index} part={part} names={names} />
            ))}
          </ul>
        )
      )}
      {!refused && (note || !verdict) && (
        <div className={styles.foot}>
          {note && <p className={styles.why}>{note}</p>}
          {!verdict && (
            <button type="button" className={styles.judge} onClick={onJudge} disabled={judging} aria-busy={judging}>
              {judging ? '기록을 뒤지는 중…' : '진짜야?'}
            </button>
          )}
        </div>
      )}
      {verdict && (
        <div className={styles.verdict} data-verdict={verdict.verdict}>
          <span className={styles.verdictChip} data-verdict={verdict.verdict}>
            {VERDICT_LABEL[verdict.verdict]}
          </span>
          <p className={styles.verdictHead}>{verdict.headline}</p>
          <p className={styles.verdictBody}>{verdict.body}</p>
          <p className={styles.verdictSource}>{verdict.source === 'ai' ? 'AI 판정' : '기록표 판정'}</p>
        </div>
      )}
      <span className={controls.srOnly} aria-live="polite">
        {judging ? '판정하는 중' : ''}
      </span>
    </article>
  );
}
