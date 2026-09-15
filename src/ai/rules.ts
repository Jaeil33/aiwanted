import type { EvidenceData } from '../types/data';
import type {
  EffectPart,
  Evidence,
  Interpretation,
  KnobId,
  MeasuredId,
  PromptContext,
  Scope,
  Subject,
  Verdict,
  VerdictResult,
} from '../types/domain';

/*
 * AI를 쓸 수 없을 때의 규칙 해석·규칙 판정. 확률이나 실측 효과 크기는 만들지 않는다(ADR-003, ADR-004):
 * 문장을 손잡이·실측 변수로 옮기기만 하고, 판정은 evidence item을 그대로 읽는다.
 */

/** 규칙으로 효과를 찾지 못했을 때의 해설 */
export const NO_EFFECT_COMMENT = '승부와 이어 붙일 방법이 없는 변수로 판정했어요. 차이는 0이에요.';

export const VERDICT_HEADLINE: Record<Verdict, string> = {
  real: '기록으로 확인된 효과예요',
  maybe: '있을 수도, 없을 수도 있어요',
  useless: '쓸모없는 변수로 판정됐어요',
};
export const UNMEASURABLE_HEADLINE = '기록으로 잴 수 없는 변수예요';
export const UNMEASURABLE_BODY = '이런 이야기는 경기 기록에 남지 않아 실제 효과를 잴 수 없어요.';
export const NO_EVIDENCE_HEADLINE = '판정 데이터가 아직 없어요';
const NO_EVIDENCE_BODY = '실측 판정표가 아직 준비되지 않아 효과를 확인할 수 없어요.';

const MAX_PARTS = 3;
const MAX_VARIABLES = 3;

type KnobPick = readonly [knob: KnobId, strength: number];

interface PersonRule {
  re: RegExp;
  batter: KnobPick | null;
  pitcher: KnobPick | null;
  scope: Scope;
  evidence: Evidence;
  why: string;
}

/**
 * 프로토타입 app.js RULES의 사람 규칙(knob·세기·scope·why 그대로).
 * 낱말 경계만 보강했다: "~라면" 어미, "모자라", "헤어스타일"은 규칙에 걸리지 않는다. 숙취는 safety가 거부한다.
 */
const PERSON_RULES: readonly PersonRule[] = [
  { re: /짜장|짬뽕|곱빼기|과식|배불|야식|치킨|(?<![가-힣])라면|컵라면|삼겹|떡볶이|피자|햄버거|폭식/, batter: ['focus', -1], pitcher: ['stamina', -1], scope: 'game', evidence: 'fun', why: '배가 부르면 몸이 무거워진다는 가정' },
  { re: /든든|보양|삼계탕|장어|홍삼|영양제/, batter: ['focus', 1], pitcher: ['stamina', 1], scope: 'game', evidence: 'fun', why: '든든하게 먹으면 힘이 난다는 가정' },
  { re: /늦잠|못 ?잤|밤새|피곤|새벽|불면|졸려|졸음|잠을? ?설쳤/, batter: ['focus', -1], pitcher: ['stamina', -2], scope: 'game', evidence: 'plausible', why: '잠이 모자라면 반응과 체력이 떨어져요' },
  { re: /로또|당첨|생일|칭찬|용돈|기분 ?좋|축하|결혼|득남|득녀|첫 ?아이|보너스/, batter: ['focus', 1], pitcher: ['nerve', 1], scope: 'game', evidence: 'fun', why: '기분이 좋으면 집중이 잘 된다는 가정' },
  { re: /이별|헤어(?:졌|진|지|짐)|차였|싸웠|혼났|악플|우울|긴장|떨려|떨고|멘붕/, batter: ['focus', -1], pitcher: ['nerve', -1], scope: 'game', evidence: 'fun', why: '마음이 흔들리면 실수가 늘어난다는 가정' },
  { re: /징크스|루틴|수염|염색|양말|속옷|부적|행운/, batter: ['focus', 1], pitcher: ['nerve', 1], scope: 'game', evidence: 'fun', why: '징크스는 믿는 만큼 통한다는 가정' },
  { re: /똥|화장실|대변|소변|오줌|방귀|볼일이?\s*급/, batter: ['focus', -2], pitcher: ['control', -2], scope: 'pa', evidence: 'fun', why: '급한 신호가 오면 온 신경이 거기로 간다는 가정' },
  { re: /딸꾹질|재채기|기침|하품|먼지|모기|벌레|나방|잠자리|파리/, batter: ['focus', -1], pitcher: ['control', -1], scope: 'pa', evidence: 'fun', why: '순간 집중이 깨지는 방해 요소' },
  { re: /새 ?배트|배트를? ?바꿨|방망이/, batter: ['contact', 1], pitcher: null, scope: 'game', evidence: 'fun', why: '새 장비 효과라는 가정' },
  { re: /장갑|글러브|신발|스파이크|모자(?!라|란|랐|람)|헬멧|유니폼|벨트/, batter: ['contact', -1], pitcher: ['control', -1], scope: 'pa', evidence: 'fun', why: '장비가 신경 쓰이면 동작이 흐트러진다는 가정' },
  { re: /부모님|엄마|아빠|가족|아내|남편|여자 ?친구|남자 ?친구|아들/, batter: ['focus', 1], pitcher: ['nerve', 1], scope: 'game', evidence: 'fun', why: '가족 앞에서 힘이 난다는 가정' },
];

interface KnobFallback {
  knob: KnobId;
  strength: number;
  scope: Scope;
  evidence: Evidence;
}

interface MeasuredRule {
  variable: MeasuredId;
  /** 문장에서 measured.json 단위의 값을 찾는다. 없으면 null */
  find(text: string): number | null;
  target: 'everyone' | 'team' | 'pitcher';
  why(value: number): string;
  /** measuredAvailable이 아닐 때 대신 쓰는 손잡이(대상은 같은 대상) */
  fallback?(value: number): KnobFallback | null;
}

const TEMP_NUMBER = /(영하\s*)?(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*(?:도(?!루)|℃|°C)/;
const WIND_NUMBER = /(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*(?:m\/s|㎧)/;
const TEMP_CENTER = 20;

function findTemp(text: string): number | null {
  const m = TEMP_NUMBER.exec(text);
  if (m) {
    const value = Number(m[2]) * (m[1] ? -1 : 1);
    if (value >= -20 && value <= 45) return value;
  }
  if (/폭염|무더위|더워|더운/.test(text)) return 32;
  if (/쌀쌀|추워|추운|한파/.test(text)) return 8;
  return null;
}

function findWind(text: string): number | null {
  const m = WIND_NUMBER.exec(text);
  if (m) return Number(m[1]);
  return /강풍|바람이\s*세|태풍/.test(text) ? 9 : null;
}

const flag = (re: RegExp) => (text: string) => (re.test(text) ? 1 : null);
const starter = (re: RegExp) => (text: string) => (text.includes('선발') && re.test(text) ? 1 : null);

/** 날씨·일정 규칙: 실측 변수(measured.json)와 대체 손잡이 */
const MEASURED_RULES: readonly MeasuredRule[] = [
  {
    variable: 'temp_c',
    find: findTemp,
    target: 'everyone',
    why: (v) => (v >= TEMP_CENTER ? '더운 공기는 타구를 더 멀리 보내요' : '찬 공기는 타구 비거리를 줄여요'),
    fallback: (v) => (v === TEMP_CENTER ? null : { knob: 'carry', strength: v > TEMP_CENTER ? 2 : -2, scope: 'game', evidence: 'plausible' }),
  },
  { variable: 'wind_ms', find: findWind, target: 'everyone', why: () => '바람이 세면 타구가 흔들려요' },
  {
    variable: 'rain_pre3h',
    find: (text) => (/(?<![가-힣])비가|(?<![가-힣])비\s?온|빗방울|우천|젖은|습한/.test(text) ? 3 : null),
    target: 'everyone',
    why: () => '젖은 공은 채기 어려워 볼이 늘어요',
    fallback: () => ({ knob: 'slick', strength: 2, scope: 'game', evidence: 'plausible' }),
  },
  {
    variable: 'day_game',
    find: flag(/낮\s?경기|땡볕|햇빛/),
    target: 'everyone',
    why: () => '햇빛에 공이 잘 안 보이면 헛스윙이 늘어요',
    fallback: () => ({ knob: 'glare', strength: 1, scope: 'pa', evidence: 'plausible' }),
  },
  { variable: 'weekend', find: flag(/주말|토요일|일요일/), target: 'everyone', why: () => '주말 경기는 관중과 분위기가 달라요' },
  {
    variable: 'travel_km',
    find: (text) => (/원정길|장거리\s?이동|버스로/.test(text) ? 350 : null),
    target: 'team',
    why: () => '먼 길을 오면 몸이 무거울 수 있어요',
    fallback: () => ({ knob: 'mood', strength: -1, scope: 'game', evidence: 'fun' }),
  },
  {
    variable: 'after_off_day',
    find: flag(/푹\s?쉬|휴식일|쉬고\s?온/),
    target: 'team',
    why: () => '푹 쉬고 오면 몸이 가벼울 수 있어요',
    fallback: () => ({ knob: 'mood', strength: 1, scope: 'game', evidence: 'fun' }),
  },
  {
    variable: 'starter_short_rest',
    find: starter(/짧게\s?쉬|당겨서|덜\s?쉬/),
    target: 'pitcher',
    why: () => '짧게 쉬고 나온 선발은 힘이 떨어질 수 있어요',
    fallback: () => ({ knob: 'stamina', strength: -1, scope: 'game', evidence: 'plausible' }),
  },
  {
    variable: 'starter_long_rest',
    find: starter(/오래\s?쉬|열흘|복귀/),
    target: 'pitcher',
    why: () => '오래 쉬고 나온 선발은 실전 감각이 무딜 수 있어요',
    fallback: () => ({ knob: 'control', strength: -1, scope: 'game', evidence: 'fun' }),
  },
];

const CROWD = /관중|함성|떼창|응원가|만석|매진|응원/;
const CROWD_WHY = '홈 관중의 응원은 홈팀에 힘을 실어줘요';
const PITCHER_WORDS = /투수|포수|마무리|선발|불펜|마운드/;
const BATTER_WORDS = /타자|대타|타석/;

function mentions(text: string, name: string): boolean {
  return name !== '' && text.includes(name);
}

/** 투수 쪽 말만 있으면 pitcher, 타자 이름·말이 함께 있거나 아무도 없으면 batter */
function personSubject(text: string, ctx: PromptContext): 'batter' | 'pitcher' {
  const pitcher = mentions(text, ctx.pitcher.name) || PITCHER_WORDS.test(text);
  const batter = mentions(text, ctx.batter.name)
    || ctx.lineupNames.some((name) => mentions(text, name))
    || BATTER_WORDS.test(text);
  return pitcher && !batter ? 'pitcher' : 'batter';
}

/** 팀 변수의 대상: 원정팀·홈팀(또는 팀 이름) 중 하나만 말하면 그 팀의 공격·수비 여부, 아니면 공격팀 */
function teamSubject(text: string, ctx: PromptContext): 'battingTeam' | 'fieldingTeam' {
  const away = mentions(text, ctx.awayName) || /원정\s?팀/.test(text);
  const home = mentions(text, ctx.homeName) || /홈\s?팀/.test(text);
  if (away === home) return 'battingTeam';
  return ctx.battingTeam === (away ? ctx.awayName : ctx.homeName) ? 'battingTeam' : 'fieldingTeam';
}

function partKey(part: EffectPart): string {
  return part.kind === 'knob' ? `knob:${part.knob}:${part.subject}` : `measured:${part.variable}:${part.subject}`;
}

/** 규칙 해석(source 'rules'). 효과는 최대 3개, 같은 손잡이·변수와 대상은 첫 번째만 */
export function ruleInterpret(text: string, ctx: PromptContext, opts: { measuredAvailable: boolean }): Interpretation {
  const parts: EffectPart[] = [];
  let comment = '';
  const add = (part: EffectPart) => {
    if (parts.length === MAX_PARTS || parts.some((p) => partKey(p) === partKey(part))) return;
    parts.push(part);
    comment ||= part.why;
  };

  const person = personSubject(text, ctx);
  for (const rule of PERSON_RULES) {
    const pick = rule[person];
    if (!pick || !rule.re.test(text)) continue;
    add({ kind: 'knob', knob: pick[0], subject: person, strength: pick[1], scope: rule.scope, evidence: rule.evidence, why: rule.why });
  }

  for (const rule of MEASURED_RULES) {
    const value = rule.find(text);
    if (value === null) continue;
    const subject: Subject = rule.target === 'team' ? teamSubject(text, ctx) : rule.target;
    const why = rule.why(value);
    if (opts.measuredAvailable) {
      add({ kind: 'measured', variable: rule.variable, value, subject, why });
      continue;
    }
    const fallback = rule.fallback?.(value);
    if (fallback) add({ kind: 'knob', ...fallback, subject, why });
  }

  if (CROWD.test(text)) {
    const subject = ctx.battingTeam === ctx.homeName ? 'battingTeam' : 'fieldingTeam';
    add({ kind: 'knob', knob: 'mood', subject, strength: 1, scope: 'game', evidence: 'plausible', why: CROWD_WHY });
  }

  return { source: 'rules', refused: false, reason: '', comment: parts.length > 0 ? comment : NO_EFFECT_COMMENT, parts };
}

/** 규칙 판정(source 'rules'): 해석의 실측 변수와 날씨·일정 키워드 변수 중 evidence에 있는 첫 변수의 판정 */
export function rulesVerdict(text: string, interpretation: Interpretation, evidence: EvidenceData | null): VerdictResult {
  if (!evidence) {
    return { source: 'rules', variables: [], verdict: 'unmeasurable', headline: NO_EVIDENCE_HEADLINE, body: NO_EVIDENCE_BODY };
  }
  const candidates = [
    ...interpretation.parts.flatMap((part) => (part.kind === 'measured' ? [part.variable] : [])),
    ...MEASURED_RULES.filter((rule) => rule.find(text) !== null).map((rule) => rule.variable),
  ];
  const items = new Map(evidence.items.map((item) => [item.id, item]));
  const variables = [...new Set(candidates)].filter((id) => items.has(id)).slice(0, MAX_VARIABLES);
  const first = variables.length > 0 ? items.get(variables[0]) : undefined;
  if (!first) {
    return { source: 'rules', variables: [], verdict: 'unmeasurable', headline: UNMEASURABLE_HEADLINE, body: UNMEASURABLE_BODY };
  }
  return { source: 'rules', variables, verdict: first.verdict, headline: VERDICT_HEADLINE[first.verdict], body: first.note };
}
