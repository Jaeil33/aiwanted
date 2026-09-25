import { KNOB_META, SUBJECT_LABEL } from '../domain/knobs';
import { MEASURED } from '../domain/measured';
import type { EffectPart, GameState, Half, Side } from '../types/domain';
import type { PlayLogEntry, SessionState } from './session';

/*
 * 결과 화면(UI_GUIDE 결과)의 파생 값. 순수 모듈: 확률은 받은 엔진 값을 나누기만 하고 새로 만들지 않는다(CLAUDE.md CRITICAL).
 */

/** 확률(또는 비율) 묶음을 합 1,000인 정수로 나눈다(최대 잔여법, 잔여가 같으면 앞 칸). 합이 0이거나 음수·숫자 아님이 있으면 모두 0 */
export function splitThousand(values: readonly number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || values.some((v) => !Number.isFinite(v) || v < 0)) return values.map(() => 0);
  const scaled = values.map((v) => (v / sum) * 1000);
  const floors = scaled.map(Math.floor);
  let left = 1000 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => ({ i, rem: v - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** deciderLine이 쓰는 부분만. 여기서 멈췄는지(stopped)는 머리말이 따로 읽는다 */
type Final = Pick<NonNullable<SessionState['final']>, 'winner' | 'walkoff' | 'state'>;

const HALF_NAME = ['초', '말'] as const;
const sideOf = (half: Half): Side => (half === 0 ? 'away' : 'home');
/** 삼자범퇴로 셀 수 있는 타석 헤드라인(주자가 나가지 않은 아웃) */
const CLEAN_OUTS = new Set(['삼진', '땅볼 아웃', '뜬공 아웃', '직선타 아웃']);

interface HalfBlock {
  inning: number;
  half: Half;
  /** 이 반이닝 시작 점수 */
  before: { away: number; home: number };
  entries: PlayLogEntry[];
}

/**
 * 결과 머리말 한 줄: "<장면 상황>에서 <그 반이닝 득점>, <마지막 반이닝>".
 * 끝내기면 "…회말 끝내기 …", 마지막 반이닝이 세 타석 모두 아웃이고 무득점이면 "삼자범퇴", 무승부면 "<이닝>회 무승부".
 */
export function deciderLine(args: { title: string; start: GameState; log: readonly PlayLogEntry[]; final: Final; teams?: { away: string; home: string } }): string {
  const { start, log, final, teams } = args;
  const situation = args.title.split(',')[0].trim() || `${start.inning}회${HALF_NAME[start.half]}`;
  if (log.length === 0) return situation;

  const blocks: HalfBlock[] = [];
  let score = { away: start.away, home: start.home };
  for (const entry of log) {
    const last = blocks[blocks.length - 1];
    if (!last || last.inning !== entry.inning || last.half !== entry.half) {
      blocks.push({ inning: entry.inning, half: entry.half, before: score, entries: [] });
    }
    blocks[blocks.length - 1].entries.push(entry);
    score = entry.score;
  }
  const runsOf = (block: HalfBlock) => {
    const side = sideOf(block.half);
    return block.entries[block.entries.length - 1].score[side] - block.before[side];
  };
  const lastEntry = log[log.length - 1];
  const walkoffText = () => {
    const text = lastEntry.headline.replace(/!+$/, '').trim();
    return text.startsWith('끝내기') ? text : `끝내기 ${text}`;
  };

  const first = blocks[0];
  if (final.walkoff && blocks.length === 1) return `${situation}에서 ${walkoffText()}`;
  const firstRuns = runsOf(first);
  const head = `${situation}에서 ${firstRuns > 0 ? `${firstRuns}점` : '무득점'}`;
  if (final.winner === 'tie') return `${head}, ${final.state.inning}회 무승부`;
  if (blocks.length === 1) return head;

  const lastBlock = blocks[blocks.length - 1];
  const label = `${lastBlock.inning}회${HALF_NAME[lastBlock.half]}`;
  if (final.walkoff) return `${head}, ${label} ${walkoffText()}`;
  const runs = runsOf(lastBlock);
  if (runs > 0) return `${head}, ${label} ${teams ? `${teams[sideOf(lastBlock.half)]} ` : ''}${runs}점`;
  const clean = lastBlock.entries.length === 3 && lastBlock.entries.every((entry) => CLEAN_OUTS.has(entry.headline));
  return `${head}, ${label} ${clean ? '삼자범퇴' : '무득점'}`;
}

/** 나비효과 줄의 TMI 이름: 앞의 선수 이름(+조사, 띄어쓰기 필요)을 떼고 max 글자로 줄인다. 떼고 나서 비면 원문 */
export function tmiShortLabel(text: string, names: readonly string[], max = 10): string {
  const whole = text.trim();
  let body = whole;
  for (const name of names) {
    if (!name || !body.startsWith(name)) continue;
    const rest = body.slice(name.length);
    const particle = /^(?:이|가|은|는|의|도)?\s+/.exec(rest);
    if (!particle) continue;
    body = rest.slice(particle[0].length).trim();
    break;
  }
  if (!body) body = whole;
  const chars = [...body];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : body;
}

const MEASURED_BY_ID = new Map(MEASURED.map((def) => [def.id, def] as const));
const formatValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** 효과 한 줄: 손잡이 "투수 체력 ↓"(환경·모두는 대상 생략, 팀 손잡이는 "팀" 한 번만), 실측 "기온 35°C"·지표 "낮 경기" */
export function effectLabel(part: EffectPart): string {
  if (part.kind === 'measured') {
    const def = MEASURED_BY_ID.get(part.variable);
    if (!def) return String(part.variable);
    if (def.transform.kind === 'indicator') return part.value !== 0 ? def.label : `${def.label} 아님`;
    return `${def.label} ${formatValue(part.value)}${def.unit}`;
  }
  const meta = Object.hasOwn(KNOB_META, part.knob) ? KNOB_META[part.knob] : null;
  let label = meta ? meta.label : String(part.knob);
  const subject = part.subject === 'everyone' || meta?.who === 'env' ? '' : Object.hasOwn(SUBJECT_LABEL, part.subject) ? SUBJECT_LABEL[part.subject] : '';
  if (subject.endsWith('팀') && label.startsWith('팀 ')) label = label.slice(2);
  const arrow = part.strength > 0 ? '↑' : '↓';
  return [subject, label, arrow].filter(Boolean).join(' ');
}
