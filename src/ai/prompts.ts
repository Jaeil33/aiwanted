import { KNOB_IDS, KNOB_META, SUBJECTS_FOR, SUBJECT_LABEL } from '../domain/knobs.js';
import { MEASURED } from '../domain/measured.js';
import type { EvidenceData } from '../types/data.js';
import type { EffectPart, Interpretation, MeasuredDef, MeasuredId, PromptContext, Subject } from '../types/domain.js';
import { stripControl } from './normalize.js';

/*
 * AI에게 보내는 프롬프트. 모델은 문장을 조절값으로 옮기고 설명만 한다.
 * 확률이나 실측 효과 크기는 프롬프트에 적지 않는다: 효과 크기는 판정 도구(evidence.json) 결과만 인용한다(ADR-003, ADR-004).
 */

const BATS_TEXT = { L: '좌타', R: '우타', S: '양타' } as const;
const THROWS_TEXT = { L: '좌투', R: '우투' } as const;
const MAX_LINEUP_NAMES = 20;

const APPLICABLE: readonly MeasuredDef[] = MEASURED.filter((def) => def.applicable);
const MEASURED_SUBJECTS: Record<MeasuredDef['who'], readonly Subject[]> = {
  env: ['everyone'],
  team: ['battingTeam', 'fieldingTeam', 'batter', 'pitcher', 'everyone'],
  opponentStarter: ['pitcher', 'fieldingTeam', 'batter', 'battingTeam'],
};

/** 장면 문자열을 한 줄로 편다: 줄바꿈·제어 문자는 공백으로, 연속 공백은 하나로 */
function oneLine(text: string): string {
  return stripControl(text, ' ').replace(/\s+/g, ' ').trim();
}

function sceneLine(ctx: PromptContext): string {
  const { batter, pitcher } = ctx;
  return `[장면] ${oneLine(ctx.date)} ${oneLine(ctx.stadium)} ${oneLine(ctx.awayName)} ${ctx.awayScore} : ${ctx.homeScore} ${oneLine(ctx.homeName)}, ${oneLine(ctx.situation)}.`
    + ` 타자 ${oneLine(batter.name)}(${oneLine(batter.team)}, ${BATS_TEXT[batter.bats] ?? '우타'}).`
    + ` 투수 ${oneLine(pitcher.name)}(${oneLine(pitcher.team)}, ${THROWS_TEXT[pitcher.throws] ?? '우투'}).`;
}

function weatherLine(ctx: PromptContext): string {
  const w = ctx.weather;
  const parts = [
    w.tempC === null ? '기온 기록 없음' : `기온 ${w.tempC}°C`,
    w.windMs === null ? '바람 기록 없음' : `바람 ${w.windMs}m/s`,
    w.dayGame ? '낮 경기' : '야간 경기',
  ];
  if (w.dome) parts.push('돔 구장');
  return `[날씨] ${parts.join(' · ')}`;
}

function knobLines(): string[] {
  return KNOB_IDS.map((id) => {
    const meta = KNOB_META[id];
    return `- ${id} (${meta.label}) 대상: ${SUBJECTS_FOR[meta.who].join('|')} / 양수일 때: ${meta.hint}`;
  });
}

function measuredLines(): string[] {
  return APPLICABLE.map((def) => {
    const t = def.transform;
    const value = t.kind === 'indicator'
      ? '해당하면 1'
      : `${def.unit} 단위 숫자${t.min !== undefined && t.max !== undefined ? `(${t.min}~${t.max})` : ''}`;
    return `- ${def.id} (${def.label}${def.unit ? `, ${def.unit}` : ''}) 기준: ${def.perLabel} / value: ${value} / 대상: ${MEASURED_SUBJECTS[def.who].join('|')}`;
  });
}

/** 해석 프롬프트: 역할, 장면, 손잡이 목록, (가능하면) 실측 변수 목록, 규칙, JSON 형식, 마지막 줄에 사용자 문장 */
export function buildInterpretPrompt(text: string, ctx: PromptContext, opts: { measuredAvailable: boolean }): string {
  const measured = opts.measuredAvailable;
  const example = [
    '{"kind":"knob","knob":"stamina","subject":"pitcher","strength":-1,"scope":"game","evidence":"fun","why":"..."}',
    ...(measured ? ['{"kind":"measured","variable":"temp_c","value":33,"subject":"everyone","why":"..."}'] : []),
  ];
  const names = ctx.lineupNames.slice(0, MAX_LINEUP_NAMES).map(oneLine).filter(Boolean);
  return [
    `너는 KBO 야구 중계석의 "쓸데없는 변수 분석관"이다. 시청자가 적은 사소한 TMI를 아래 확률 모델의 손잡이(knob)${measured ? '나 실측 변수(measured)' : ''}로 번역한다. 확률은 계산하지 않는다.`,
    sceneLine(ctx),
    weatherLine(ctx),
    ...(names.length > 0 ? [`[두 팀 타자] ${names.join(', ')}`] : []),
    '[손잡이]',
    ...knobLines(),
    ...(measured ? ['[실측 변수]', ...measuredLines()] : []),
    '[규칙]',
    '- kind "knob"의 strength: -3~3 정수(0 제외). 1은 사소함, 2는 눈에 띔, 3은 큼. 사소한 TMI는 대부분 1이나 -1.',
    '- subject: 손잡이마다 적힌 대상 중 하나만 쓴다. 투수 이야기면 pitcher, 타자 이야기면 batter, 팀 이야기면 battingTeam이나 fieldingTeam.',
    '- scope: 이번 타석에만 해당하면 "pa", 경기 내내 이어지면 "game".',
    '- evidence: 그럴듯한 근거가 있으면 "plausible", 순전히 재미면 "fun".',
    ...(measured
      ? ['- kind "measured": 문장에 그 사실(기온·바람·비·낮 경기·주말·원정 이동·휴식일·선발 휴식)이 분명할 때만 쓴다. value는 문장에 나온 값, 없으면 그 사실에 맞는 값. 사람 이야기를 실측 변수로 바꾸지 않는다.']
      : []),
    '- parts는 최대 3개. 승부와 이어지지 않으면 빈 배열.',
    '- 실존 인물의 범죄·음주·도박·폭력·질병·부상·사망·사생활·성적인 내용·비하가 담기면 refused를 true로, reason에 짧은 이유를 적고 parts는 빈 배열.',
    '- comment: 야구 해설위원 말투의 한국어 한 문장(60자 이내). 진지한 척하지만 웃기게. 확률·퍼센트 숫자는 쓰지 않는다.',
    '- why: 효과마다 40자 이내 한국어 근거.',
    '[출력] 다른 글 없이 JSON 하나만:',
    `{"refused":false,"reason":"","comment":"...","parts":[${example.join(',')}]}`,
    `[시청자 변수] ${JSON.stringify(text)}`,
  ].join('\n');
}

function partLine(part: EffectPart): string {
  if (part.kind === 'knob') {
    const sign = part.strength > 0 ? '+' : '';
    const scope = part.scope === 'pa' ? '이번 타석' : '경기 내내';
    return `- ${part.knob}(${KNOB_META[part.knob].label}) ${SUBJECT_LABEL[part.subject]} ${sign}${part.strength} ${scope}`;
  }
  const def = MEASURED.find((d) => d.id === part.variable);
  return `- ${part.variable}(${def?.label ?? part.variable}) ${part.value}${def?.unit ?? ''} ${SUBJECT_LABEL[part.subject]}`;
}

/** 판정 프롬프트: 도구 lookupEvidence로 최대 3개 조회, 도구 결과의 숫자만 인용, JSON 하나로 답 */
export function buildVerdictPrompt(text: string, interpretation: Interpretation, ctx: PromptContext): string {
  const parts = interpretation.parts.length > 0 ? interpretation.parts.map(partLine) : ['- 효과 없음'];
  return [
    '너는 KBO 야구 중계석 "판정소"의 해설위원이다. 시청자의 TMI가 실제 경기 기록으로 확인된 효과인지 판정한다. 확률이나 효과 크기를 새로 만들지 않는다.',
    sceneLine(ctx),
    `[시청자 변수] ${JSON.stringify(text)}`,
    `[해석 결과] ${oneLine(interpretation.comment) || '해설 없음'}`,
    ...parts,
    `[실측 변수 후보] ${APPLICABLE.map((def) => `${def.id}(${def.label})`).join(', ')}`,
    '[규칙]',
    '- 도구 lookupEvidence로 이 TMI와 맞는 실측 변수를 최대 3개까지 조회한다. 해석 결과에 실측 변수가 있으면 그것부터 조회한다.',
    '- 효과 크기·구간·판정은 도구 결과에 있는 숫자와 판정만 인용한다. 도구 결과에 없는 숫자를 만들거나 추측하지 마라.',
    '- verdict는 variables 첫 변수의 도구 결과 verdict를 그대로 쓴다.',
    '- 맞는 실측 변수가 없거나 도구가 error를 주면 그 변수는 뺀다. 남는 변수가 없으면 variables는 빈 배열, verdict는 "unmeasurable".',
    '- headline은 40자 이내 한 문장, body는 220자 이내. 야구를 잘 모르는 사람도 알아듣는 해설위원 말투.',
    '[출력] 다른 글 없이 JSON 하나만:',
    '{"variables":["temp_c"],"verdict":"real|maybe|useless|unmeasurable","headline":"...","body":"..."}',
  ].join('\n');
}

export interface VerdictToolSpec {
  name: 'lookupEvidence';
  description: string;
  inputSchema: {
    type: 'object';
    properties: { variable: { type: 'string'; enum: MeasuredId[] } };
    required: ['variable'];
  };
}

/** 판정 도구 정의. 실행(execute)은 프로바이더가 evidenceToolResult로 붙인다 */
export const VERDICT_TOOL: VerdictToolSpec = {
  name: 'lookupEvidence',
  description: '실측 변수 id로 팀-경기 기록 검증 결과(학습 시즌의 득점 변화 %와 95% 구간, 검증 시즌의 예측 개선량, 판정, 메모)를 조회한다. 효과 크기는 이 결과만 인용한다.',
  inputSchema: {
    type: 'object',
    properties: { variable: { type: 'string', enum: MEASURED.map((def) => def.id) } },
    required: ['variable'],
  },
};

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** log 득점 배수 → 득점 변화 퍼센트 */
function logToPct(x: number): number {
  return round((Math.exp(x) - 1) * 100, 2);
}

/** 판정 도구 실행 결과: evidence item 요약 또는 { error } */
export function evidenceToolResult(evidence: EvidenceData | null, variable: unknown): Record<string, unknown> {
  if (!evidence) return { error: '실측 판정표가 아직 없어 조회할 수 없어요.' };
  const item = typeof variable === 'string' ? evidence.items.find((i) => i.id === variable) : undefined;
  const def = item ? MEASURED.find((d) => d.id === item.id) : undefined;
  if (!item || !def) {
    return { error: '이 변수는 검증 기록이 없어요. available 중에서 고르세요.', available: evidence.items.map((i) => i.id) };
  }
  const seasons = evidence.trainSeasons;
  const trainText = seasons.length > 0 ? `${seasons[0]}–${seasons[seasons.length - 1]}` : '학습 시즌';
  return {
    variable: item.id,
    label: def.label,
    unit: def.unit,
    perLabel: def.perLabel,
    meaning: `runsPctPerUnit은 perLabel만큼 바뀔 때 그 팀 득점이 바뀌는 비율(%), runsPct95는 그 95% 구간(${trainText} 학습). test는 ${evidence.testSeason} 경기에 적용했을 때 경기당 예측 개선량(이탈도)과 95% 구간.`,
    runsPctPerUnit: round(item.runsPctPerUnit, 2),
    runsPct95: { low: logToPct(item.ciLow), high: logToPct(item.ciHigh) },
    train: { seasons: [...seasons], games: evidence.games.train, teamGamesWithValue: item.n },
    test: {
      season: evidence.testSeason,
      games: item.test.games,
      devianceGainPerGame: round(item.test.devianceGainPerGame, 5),
      ci95: { low: round(item.test.ciLow, 5), high: round(item.test.ciHigh, 5) },
    },
    verdict: item.verdict,
    note: item.note,
  };
}
