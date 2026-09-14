/*
 * 입력 정리(ADR-013 1단계). 순수 모듈이다: 사전 표와 정규식만 쓴다(형태소 분석기 없음, ADR-007).
 * prepareText는 원문을 정규화하고 강도 표시·개념어 토큰·숫자와 단위·절(최대 3개)을 뽑는다.
 * 뜻은 판단하지 않는다: 민감 주제(safety)·대상(targets)·개념(lexicon)은 이 결과를 읽어 따로 정한다.
 */

export type NumberUnit = 'hour' | 'minute' | 'cup' | 'bottle' | 'bowl' | 'celsius' | 'km' | 'ms' | 'count' | 'percent' | 'day';

export interface NumberMention {
  value: number;
  unit: NumberUnit | null;
  /** 원문에서 찾은 글자 그대로(정리된 문장 기준) */
  raw: string;
}

export interface Clause {
  /** 정리된 절 문장 */
  text: string;
  /** 이 절의 주어로 보이는 말(없으면 null) — 대상 추론(step 3)이 쓴다 */
  subjectHint: string | null;
}

export interface PreparedText {
  original: string;
  /** 정리된 전체 문장 */
  normalized: string;
  /** 강도 표시(ㅈㄴ, 개-, 완전, 존나 등)를 찾았을 때 1(살짝)·2(강하게), 없으면 0 */
  intensity: 0 | 1 | 2;
  /** 영어·이모지·초성·오타를 한국어 개념어로 바꿔 덧붙인 토큰(사전 매칭용) */
  tokens: string[];
  numbers: NumberMention[];
  /** 최대 3개 */
  clauses: Clause[];
}

/** 절 최대 개수. 넘치면 마지막 절에 합친다 */
export const MAX_CLAUSES = 3;

const dedupe = (list: readonly string[]): string[] => [...new Set(list)];

// ---------- 유니코드 정리 ----------

const LINE_BREAKS: ReadonlySet<number> = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);

/** 지울 문자: C0·C1 제어, 폭 없는 문자·방향 제어, BOM, 이모지 표시 선택자 */
function isInvisible(code: number): boolean {
  return code < 0x20
    || (code >= 0x7f && code <= 0x9f)
    || (code >= 0x200b && code <= 0x200f)
    || (code >= 0x202a && code <= 0x202e)
    || (code >= 0x2060 && code <= 0x206f)
    || (code >= 0xfe00 && code <= 0xfe0f)
    || code === 0xfeff;
}

/** 줄바꿈·탭은 공백으로, 보이지 않는 문자는 지운다 */
function removeInvisible(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (LINE_BREAKS.has(code)) out += ' ';
    else if (!isInvisible(code)) out += ch;
  }
  return out;
}

/** 한글 호환 자모(ㄱ~ㆎ). NFKC는 이것을 조합용 자모로 바꾸므로 건드리지 않는다 */
const COMPAT_JAMO = /[ㄱ-ㆎ]/;

/** 풀어 쓴 한글은 NFC로 모으고, 호환 자모를 뺀 나머지는 NFKC(전각 → 반각, ℃ → °C, ㎧ → m∕s) */
function unicodeNormalize(text: string): string {
  const composed = text.normalize('NFC');
  if (!COMPAT_JAMO.test(composed)) return composed.normalize('NFKC');
  return Array.from(composed, (ch) => (COMPAT_JAMO.test(ch) ? ch : ch.normalize('NFKC'))).join('');
}

/** 유니코드 정리 → 대시·마이너스는 -, 나눗셈 빗금은 /, 소문자, 같은 글자 3번 이상은 2번(숫자 제외), 공백 하나 */
function cleanText(input: string): string {
  return unicodeNormalize(removeInvisible(input))
    .replace(/[‐-―−﹣]/g, '-')
    .replace(/[⁄∕]/g, '/')
    .replace(/〜/g, '~')
    .toLowerCase()
    .replace(/([^\d\s])\1{2,}/gu, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "투 수 가 피 곤 해"처럼 한 글자씩 띄운 음절 5개 이상은 붙인다 */
const SPACED_SYLLABLES = /(?<!\S)[가-힣](?: [가-힣]){4,}(?!\S)/g;

// ---------- 오타·구어·초성 ----------

interface Rewrite {
  re: RegExp;
  to: string;
  /** 바로잡았을 때 토큰에 더할 개념어(띄어쓰기만 고치면 null) */
  token: string | null;
}

const REWRITES: readonly Rewrite[] = [
  { re: /머거따|머겄다|먹엇다/g, to: '먹었다', token: '먹었다' },
  { re: /머거씀|먹엇음|먹었씀|머겄음/g, to: '먹었음', token: '먹었음' },
  { re: /곱배기|곱뺴기|곱베기/g, to: '곱빼기', token: '곱빼기' },
  { re: /잠못잠/g, to: '잠 못 잠', token: '잠' },
  { re: /자장면/g, to: '짜장면', token: '짜장면' },
  { re: /피곤쓰/g, to: '피곤', token: '피곤' },
  { re: /컨디숀/g, to: '컨디션', token: '컨디션' },
  { re: /추버|추붜/g, to: '추워', token: '추위' },
  { re: /더버|더붜/g, to: '더워', token: '더위' },
  { re: /졸령|졸료/g, to: '졸려', token: '졸림' },
  { re: /배고팡|배고팜/g, to: '배고픔', token: '배고픔' },
  // 띄어쓰기: "잠을못잤다", "안떨림" (안타·안경처럼 붙은 낱말은 건드리지 않는다)
  { re: /(잠|밥)(을|도|은)?(못|안)(?=[가-힣])/g, to: '$1$2 $3 ', token: null },
  {
    re: /(?<![가-힣])(안|못)(?=먹|마시|마셨|잤|잠|잘|떨|졸|왔|옴|쳤|쳐|던지|던졌|잡|했|쉬|쉼|좋|났|자고|자서|자면|잔다|와서|오고|온다)/g,
    to: '$1 ',
    token: null,
  },
  { re: /(?<![가-힣])넘(?= [가-힣])/g, to: '너무', token: null },
  { re: /(?<![가-힣])(?:쫌|쪼끔|쬐끔|쪼금)(?![가-힣])/g, to: '조금', token: null },
];

/** 초성 낱말: to가 있으면 문장에서 바꾸고, 없으면 토큰만 더한다. 강도 표시(ㅈㄴ)와 욕설 초성은 여기 두지 않는다 */
const CHOSEONG_WORDS: Readonly<Record<string, { to: string | null; token: string }>> = {
  ㅌㅅ: { to: '투수', token: '투수' },
  ㅌㅈ: { to: '타자', token: '타자' },
  ㅍㅅ: { to: '포수', token: '포수' },
  ㄱㄷ: { to: '감독', token: '감독' },
  ㅍㄱ: { to: '피곤', token: '피곤' },
  ㅎㅇㅌ: { to: '화이팅', token: '응원' },
  ㅊㅋ: { to: '축하', token: '축하' },
  ㄷㄷ: { to: null, token: '떨림' },
  ㅋㅋ: { to: null, token: '웃음' },
  ㅎㅎ: { to: null, token: '웃음' },
  ㅠㅠ: { to: null, token: '슬픔' },
  ㅜㅜ: { to: null, token: '슬픔' },
};

const JAMO_RUN = /[ㄱ-ㆎ]+/g;

function choseongWord(run: string): { to: string | null; token: string } | undefined {
  return Object.hasOwn(CHOSEONG_WORDS, run) ? CHOSEONG_WORDS[run] : undefined;
}

function applyRewrites(text: string, tokens: string[]): string {
  let out = text;
  for (const rule of REWRITES) {
    const next = out.replace(rule.re, rule.to);
    if (next !== out && rule.token !== null) tokens.push(rule.token);
    out = next;
  }
  if (!COMPAT_JAMO.test(out)) return out;
  return out.replace(JAMO_RUN, (run) => {
    const word = choseongWord(run);
    if (!word || word.to === null) return run;
    tokens.push(word.token);
    return word.to;
  });
}

// ---------- 영어·이모지 토큰 ----------

/** [대표 개념어, 영어 표현들]. 표현은 소문자, 여러 낱말이면 공백 하나 */
const EN_TOKENS: ReadonlyArray<readonly [token: string, words: string]> = [
  ['투수', 'pitcher|pitchers'],
  ['타자', 'batter|batters|hitter|hitters'],
  ['포수', 'catcher'],
  ['심판', 'umpire|umpires|ump|referee'],
  ['감독', 'manager|skipper'],
  ['코치', 'coach|coaches'],
  ['관중', 'crowd|crowds|audience|spectator|spectators'],
  ['팬', 'fan|fans'],
  ['치어리더', 'cheerleader|cheerleaders'],
  ['선수', 'player|players'],
  ['에이스', 'ace'],
  ['마무리', 'closer'],
  ['선발', 'starter'],
  ['불펜', 'bullpen'],
  ['어머니', 'mom|mother|mum'],
  ['아버지', 'dad|father'],
  ['아내', 'wife'],
  ['아들', 'son'],
  ['딸', 'daughter'],
  ['아기', 'baby'],
  ['가족', 'family'],
  ['할머니', 'grandma|grandmother'],
  ['강아지', 'dog|dogs|puppy'],
  ['고양이', 'cat|cats|kitten'],
  ['먹었다', 'ate|eat|eats|eating'],
  ['마셨다', 'drank|drink|drinks|drinking'],
  ['잠', 'slept|sleep|sleeping'],
  ['낮잠', 'nap|napped'],
  ['늦잠', 'overslept'],
  ['홈런', 'homer|homers|homerun|homeruns|home run|home runs'],
  ['삼진', 'strikeout|strikeouts'],
  ['볼넷', 'walk|walks'],
  ['도루', 'steal|steals|stole'],
  ['응원', 'cheer|cheers|cheering|fighting|hwaiting'],
  ['야유', 'boo|boos|booing'],
  ['연습', 'practice'],
  ['이동', 'travel|traveled|travelled|trip'],
  ['비행기', 'flight|plane|airplane'],
  ['버스', 'bus'],
  ['기차', 'train|ktx'],
  ['휴식', 'rest|rested|day off|off day'],
  ['피곤', 'tired|sleepy|exhausted|fatigue|fatigued|worn out'],
  ['배고픔', 'hungry|starving'],
  ['배부름', 'full|stuffed'],
  ['긴장', 'nervous|anxious|tense|jittery'],
  ['화남', 'angry|mad|furious|pissed'],
  ['기쁨', 'happy|glad|joy|joyful'],
  ['슬픔', 'sad|upset'],
  ['설렘', 'excited|thrilled|hyped'],
  ['자신감', 'confident|confidence'],
  ['집중', 'focused|focus'],
  ['침착', 'calm'],
  ['힘', 'energy|energetic|pumped|strong'],
  ['아픔', 'sick|ill|flu|fever'],
  ['부상', 'injured|injury|hurt'],
  ['술', 'alcohol|booze|wine|whiskey|vodka|soju|drunk|hangover|hungover'],
  ['맥주', 'beer|beers'],
  ['좋음', 'good|great|awesome|amazing|best|perfect|nice'],
  ['나쁨', 'bad|terrible|awful|worst'],
  ['행운', 'lucky|luck'],
  ['불운', 'unlucky'],
  ['비', 'rain|rains|raining|rainy|rained|drizzle|shower|showers'],
  ['태풍', 'storm|typhoon'],
  ['천둥', 'thunder|lightning'],
  ['바람', 'wind|winds|windy|gust|gusts|breeze'],
  ['더위', 'hot|heat|heatwave|scorching'],
  ['추위', 'cold|chilly|freezing'],
  ['습도', 'humid|humidity|muggy'],
  ['안개', 'fog|foggy|mist|misty'],
  ['햇빛', 'sun|sunny|sunshine|sunlight'],
  ['눈', 'snow|snowing'],
  ['미세먼지', 'dust|smog'],
  ['조명', 'lights|floodlights'],
  ['노을', 'sunset'],
  ['커피', 'coffee|coffees|latte|americano|espresso'],
  ['에너지음료', 'energy drink|energy drinks|red bull|monster'],
  ['라면', 'ramen|ramyeon|noodle|noodles'],
  ['짜장면', 'jjajangmyeon|jajangmyeon'],
  ['치킨', 'chicken'],
  ['피자', 'pizza'],
  ['햄버거', 'burger|burgers|hamburger'],
  ['고기', 'meat|bbq|steak|pork|beef'],
  ['바나나', 'banana|bananas'],
  ['매운맛', 'spicy'],
  ['밥', 'rice|meal'],
  ['음식', 'food'],
  ['과식', 'overate|overeating|buffet|feast'],
  ['배트', 'bat|bats'],
  ['새', 'new'],
  ['글러브', 'glove|gloves|mitt'],
  ['신발', 'shoes|cleats|spikes|sneakers'],
  ['유니폼', 'uniform|jersey'],
  ['헬멧', 'helmet'],
  ['모자', 'cap|hat'],
  ['속옷', 'underwear|boxers|briefs|panties'],
  ['양말', 'socks'],
  ['수염', 'beard|mustache'],
  ['머리', 'haircut'],
  ['부적', 'charm|amulet|talisman'],
  ['루틴', 'routine|ritual'],
  ['징크스', 'jinx|superstition'],
  ['등장곡', 'walkup song|walk-up song|entrance song'],
  ['함성', 'loud|noise|noisy'],
  ['만석', 'sold out|sellout|full house|packed'],
  ['생일', 'birthday|bday'],
  ['결혼', 'wedding|anniversary'],
  ['로또', 'lotto|lottery|jackpot'],
  ['선물', 'gift|present'],
  ['연봉', 'salary|contract'],
  ['홈', 'home'],
  ['원정', 'away|road'],
  ['뜨거움', 'fire|burning'],
  ['경기', 'game'],
];

/** [대표 개념어, 이모지들(표시 선택자 없이, 공백으로 구분)] */
const EMOJI_TOKENS: ReadonlyArray<readonly [token: string, emoji: string]> = [
  ['비', '🌧 🌦 🌨 ☔ ☂ 🌂 💧'],
  ['천둥', '⛈ 🌩'],
  ['햇빛', '☀ 🌞 🌤 ⛅'],
  ['더위', '🥵'],
  ['추위', '🥶 ❄ ☃ ⛄'],
  ['바람', '🌬 💨 🌪 🍃'],
  ['안개', '🌫'],
  ['뜨거움', '🔥'],
  ['졸림', '😴 💤 🥱 😪'],
  ['피곤', '😫 😩 🫠'],
  ['라면', '🍜'],
  ['맥주', '🍺 🍻'],
  ['술', '🍷 🍶 🥃 🍾 🍸 🥂'],
  ['치킨', '🍗'],
  ['피자', '🍕'],
  ['햄버거', '🍔'],
  ['고기', '🍖 🥩 🥓'],
  ['커피', '☕'],
  ['바나나', '🍌'],
  ['밥', '🍚 🍙 🍱'],
  ['매운맛', '🌶'],
  ['음료', '🥤 🧃'],
  ['생일', '🎂'],
  ['축하', '🎉 🥳 🎊'],
  ['야구', '⚾'],
  ['화남', '😡 🤬 😠 💢'],
  ['긴장', '😨 😰 😱 😬'],
  ['슬픔', '😭 😢 😿 💔'],
  ['기쁨', '😊 😁 😄 😆 🥰 😍 😀 😃 ☺ 🙂'],
  ['자신감', '😎'],
  ['힘', '💪'],
  ['행운', '🍀'],
  ['아기', '👶 🍼'],
  ['강아지', '🐶 🐕'],
  ['고양이', '🐱 🐈'],
  ['호랑이', '🐯 🐅'],
  ['사자', '🦁'],
  ['곰', '🐻'],
  ['독수리', '🦅'],
  ['공룡', '🦖 🦕'],
  ['좋음', '👍 💯 👌'],
  ['나쁨', '👎'],
  ['버스', '🚌'],
  ['비행기', '✈ 🛫'],
  ['기차', '🚄 🚅 🚆'],
  ['장갑', '🧤'],
  ['신발', '👟'],
  ['모자', '🧢'],
  ['돈', '💰 💸 🤑'],
  ['응원', '📣 📢'],
  ['박수', '👏'],
  ['기도', '🙏'],
  ['도박', '🎰 🎲'],
  ['약', '💊 💉'],
  ['아픔', '🤒 🤧 😷 🤕'],
  ['망함', '💀 ☠'],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

function lookupTable(entries: ReadonlyArray<readonly [string, string]>, separator: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [token, list] of entries) for (const key of list.split(separator)) map.set(key, token);
  return map;
}

/** 긴 표현을 먼저 찾도록 길이 내림차순 alternation */
function alternation(keys: Iterable<string>): string {
  return [...keys].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
}

const EN_MAP = lookupTable(EN_TOKENS, '|');
const EN_RE = new RegExp(`\\b(?:${alternation(EN_MAP.keys())})\\b`, 'g');
const EMOJI_MAP = lookupTable(EMOJI_TOKENS, ' ');
const EMOJI_RE = new RegExp(alternation(EMOJI_MAP.keys()), 'gu');
/** 이모지가 있을 수 있는 범위(없으면 이모지 사전을 건너뛴다) */
const MAYBE_EMOJI = /[☀-➿⬀-⯿\u{1f000}-\u{1faff}]/u;

/** 정리된 문장(또는 절)의 영어·이모지·초성 토큰을 나온 순서대로(중복 없이) */
export function tokensOf(text: string): string[] {
  const found: Array<readonly [index: number, token: string]> = [];
  const collect = (re: RegExp, lookup: (match: string) => string | undefined) => {
    for (const m of text.matchAll(re)) {
      const token = lookup(m[0]);
      if (token) found.push([m.index ?? 0, token]);
    }
  };
  if (/[a-z]/.test(text)) collect(EN_RE, (m) => EN_MAP.get(m));
  if (MAYBE_EMOJI.test(text)) collect(EMOJI_RE, (m) => EMOJI_MAP.get(m));
  if (COMPAT_JAMO.test(text)) collect(JAMO_RUN, (m) => choseongWord(m)?.token);
  found.sort((a, b) => a[0] - b[0]);
  return dedupe(found.map(([, token]) => token));
}

// ---------- 강도 ----------

/** 강조 접두 "개-·핵-·초-·왕-" 뒤에 오는 말(개막·핵심·초속 같은 낱말은 강조가 아니다) */
const PREFIX_STEMS = '피곤|빡|좋|싫|잘|못|웃|쩔|열받|짜증|무섭|무서|떨|긴장|힘들|힘듦|배고|배불|졸|덥|더워|더움|춥|추워|추움|멋|맛있|귀엽|이득|꿀|많|세|쎄|느리|빠르|약하|강하|흥분|설레|설렘|신나|신남|불안|답답|슬프|기뻐|기쁨|행복|노잼|꿀잼|재밌|빡세|지침|지쳤|힘없|무거|가벼|부럽|아프|아파';
const STRONG = new RegExp(
  `ㅈㄴ|ㅈㄹ|ㄹㅇ|ㅁㅊ|존나|졸라|존내|겁나|완전|엄청|너무|매우|아주(?!머니)|정말|진짜|되게|무지|굉장히|몹시|심하게|극도로|미친\\s?듯이|오지게|지리게|레알`
  + `|(?<![가-힣])(?:개|핵|초|왕)(?=${PREFIX_STEMS})`
  + '|\\b(?:super|very|so|really|extremely|totally|insanely|too)\\b',
);
const WEAK = /살짝|조금|(?<![가-힣])좀(?!비)|약간|다소|\b(?:slightly|kinda|somewhat|a bit|a little)\b/;

/** 강도 표시: 강하게(2)가 하나라도 있으면 2, 살짝(1)만 있으면 1, 없으면 0 */
export function intensityOf(text: string): 0 | 1 | 2 {
  if (STRONG.test(text)) return 2;
  return WEAK.test(text) ? 1 : 0;
}

// ---------- 숫자와 단위 ----------

/** 한국어 단위 낱말 뒤: 문장 끝, 한글이 아닌 글자, 또는 조사·어미 첫 글자 */
const KO_AFTER = '(?=$|[^가-힣]|[이가은는을를도만의에와과로씩째쯤간동안밖뿐나요임인엔서까정부라래차짜])';

type UnitRule = readonly [re: RegExp, unit: NumberUnit | null];

/** 숫자 바로 뒤에서 순서대로 찾는다. unit null 규칙(km/h, 미터)은 앞말로 다시 정한다 */
const UNIT_RULES: readonly UnitRule[] = [
  [/^\s*(?:km\s*\/\s*h|kmh|kph)(?![a-z])/, null],
  [new RegExp(`^\\s*시간(?:\\s*반)?${KO_AFTER}`), 'hour'],
  [/^\s*(?:hours?|hrs?|h)(?![a-z])/, 'hour'],
  [new RegExp(`^\\s*분${KO_AFTER}`), 'minute'],
  [/^\s*(?:minutes?|mins?)(?![a-z])/, 'minute'],
  [new RegExp(`^\\s*(?:잔|샷)${KO_AFTER}`), 'cup'],
  [/^\s*(?:cups?|coffees?|shots?|glasses)(?![a-z])/, 'cup'],
  [new RegExp(`^\\s*(?:병|캔)${KO_AFTER}`), 'bottle'],
  [/^\s*(?:bottles?|cans?|beers?)(?![a-z])/, 'bottle'],
  [new RegExp(`^\\s*(?:그릇|공기|인분|사발|접시)${KO_AFTER}`), 'bowl'],
  [/^\s*(?:bowls?|servings?|plates?)(?![a-z])/, 'bowl'],
  [
    new RegExp(`^\\s*(?:마리|개|판|조각|번|회|명|경기|연전|연승|연패|이닝|타석|타수|안타|홈런|삼진|볼넷|실책|도루|세이브|홀드|타점|득점|실점|점|구|승|패|등|위)${KO_AFTER}`),
    'count',
  ],
  [/^\s*(?:times|games?|innings?|pitches|hits|homers|strikeouts|walks|errors|runs|pieces|slices)(?![a-z])/, 'count'],
  [new RegExp(`^\\s*도${KO_AFTER}`), 'celsius'],
  [/^\s*(?:°c|°|degrees?|deg|c)(?![a-z])/, 'celsius'],
  [/^\s*(?:km|kilometers?|kilometres?|킬로미터|킬로|키로)(?![a-z])/, 'km'],
  [/^\s*(?:m\s*\/\s*s(?:ec)?|mps)(?![a-z])/, 'ms'],
  [/^\s*(?:%|퍼센트|percent)/, 'percent'],
  [new RegExp(`^\\s*프로${KO_AFTER}`), 'percent'],
  [new RegExp(`^\\s*일${KO_AFTER}`), 'day'],
  [/^\s*days?(?![a-z])/, 'day'],
  [/^\s*(?:미터|m)(?![a-z/])/, null],
];

const NUMBER_RE = /(?<![\d.])(-(?=\d))?(\d+(?:\.\d+)?)(?:\s*~\s*(\d+(?:\.\d+)?))?/g;
const BEFORE_MINUS = /영하\s*$/;
const BEFORE_CELSIUS = /섭씨\s*$/;
const BEFORE_BODY = /(?:체온|미열|고열|(?<![가-힣])열(?:이|은|도|가)?)\s*$/;
const BEFORE_TEMP = /(?:기온|온도)\s*$/;
const BEFORE_WIND = /초속\s*$/;
const BEFORE_SPEED = /(?:구속|스피드|speed)\s*$/;

const NATIVE_NUMBERS: Readonly<Record<string, number>> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 여덜: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12, 스무: 20,
};
const NATIVE_RE = new RegExp(
  `(?<![가-힣])(열한|열두|다섯|여섯|일곱|여덟|여덜|아홉|스무|한|두|세|네|열)\\s*(시간(?:\\s*반)?|잔|샷|병|캔|그릇|공기|사발|접시|마리|개|판|조각|번|명|경기|이닝|타석)${KO_AFTER}`,
  'g',
);
const DAY_WORDS: Readonly<Record<string, number>> = { 하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 열흘: 10, 보름: 15 };
const DAY_RE = new RegExp(`(?<![가-힣])(하루|이틀|사흘|나흘|닷새|엿새|열흘|보름)(?:${KO_AFTER}|(?=종일|만에))`, 'g');
const EN_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const EN_NUMBER_RE = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g;

function counterUnit(word: string): NumberUnit {
  if (word.startsWith('시간')) return 'hour';
  if (word === '잔' || word === '샷') return 'cup';
  if (word === '병' || word === '캔') return 'bottle';
  if (word === '그릇' || word === '공기' || word === '사발' || word === '접시') return 'bowl';
  return 'count';
}

function unitAt(rest: string): { unit: NumberUnit | null; text: string } | null {
  for (const [re, unit] of UNIT_RULES) {
    const m = re.exec(rest);
    if (m) return { unit, text: m[0] };
  }
  return null;
}

function findNumbers(text: string): NumberMention[] {
  const found: Array<readonly [index: number, mention: NumberMention]> = [];

  if (/\d/.test(text)) {
    for (const m of text.matchAll(NUMBER_RE)) {
      const index = m.index ?? 0;
      let value = Number(m[3] ?? m[2]) * (m[1] ? -1 : 1);
      let start = index;
      let end = index + m[0].length;
      const matched = unitAt(text.slice(end));
      let unit = matched?.unit ?? null;
      let unitText = matched && matched.unit !== null ? matched.text : '';
      const before = text.slice(0, index);

      if (unit === 'hour' && /반$/.test(unitText)) value += 0.5;
      if (BEFORE_MINUS.test(before) && (unit === null || unit === 'celsius')) {
        value = -Math.abs(value);
        unit = 'celsius';
        start = before.search(BEFORE_MINUS);
      } else if (BEFORE_CELSIUS.test(before) && (unit === null || unit === 'celsius')) {
        unit = 'celsius';
        start = before.search(BEFORE_CELSIUS);
      } else if (BEFORE_BODY.test(before) && (unit === null || unit === 'celsius')) {
        unit = 'celsius';
        start = before.search(BEFORE_BODY);
      } else if (BEFORE_TEMP.test(before) && unit === null && matched === null) {
        unit = 'celsius';
      } else if (BEFORE_WIND.test(before) && unit === null) {
        unit = 'ms';
        unitText = matched?.text ?? '';
        start = before.search(BEFORE_WIND);
      } else if (BEFORE_SPEED.test(before) && unit === 'km') {
        unit = null;
        unitText = '';
      }
      end += unitText.length;
      found.push([index, { value, unit, raw: text.slice(start, end).trim() }]);
    }
  }

  for (const m of text.matchAll(NATIVE_RE)) {
    const counter = m[2];
    const value = NATIVE_NUMBERS[m[1]] + (/반$/.test(counter) ? 0.5 : 0);
    found.push([m.index ?? 0, { value, unit: counterUnit(counter), raw: m[0] }]);
  }
  for (const m of text.matchAll(DAY_RE)) {
    found.push([m.index ?? 0, { value: DAY_WORDS[m[1]], unit: 'day', raw: m[1] }]);
  }
  if (/[a-z]/.test(text)) {
    for (const m of text.matchAll(EN_NUMBER_RE)) {
      const end = (m.index ?? 0) + m[0].length;
      const matched = unitAt(text.slice(end));
      if (!matched || matched.unit === null) continue;
      found.push([m.index ?? 0, { value: EN_NUMBERS[m[1]], unit: matched.unit, raw: `${m[0]}${matched.text}` }]);
    }
  }

  found.sort((a, b) => a[0] - b[0]);
  return found.map(([, mention]) => mention);
}

// ---------- 절 나누기 ----------

const SEP = '';
const CONJUNCTIONS: ReadonlySet<string> = new Set(['그리고', '그리구', '그런데', '근데', '하지만', '그래서']);
/** "~고"로 끝나지만 연결 어미가 아닌 낱말 */
const GO_NOUNS: ReadonlySet<string> = new Set(['최고', '창고', '광고', '재고', '경고', '사고', '원고', '고고', '제고', '참고', '금고', '선고', '공고', '부고']);
/** "먹고 옴", "들고 나왔다", "치고 싶어서"처럼 앞 동사와 한 덩어리인 뒷말 */
const AUX_AFTER_GO = /^(?:싶|있|계시|계신|말았|다니|다녀|들어|서서|섰)|^(?:와|와서|왔다|왔어|왔음|왔네|왔대|옴|온|온다|오는|오셨다|오심|갔다|갔어|갔음|감|간다|가서|가는|간|가|나와|나와서|나왔다|나왔어|나왔음|나왔대|나옴|나온|나온다|나오는)[.!?~]*$/;

/** 한글 음절의 받침 번호(0 = 받침 없음, 4 = ㄴ). 음절이 아니면 -1 */
function jongseong(ch: string): number {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? code % 28 : -1;
}

/** "당첨됐는데", "좋은데요"처럼 ㄴ받침 + 데로 끝나는 낱말 */
function endsWithNde(word: string): boolean {
  const m = /([가-힣])데요?[^가-힣]*$/.exec(word);
  return m !== null && jongseong(m[1]) === 4;
}

function isConnectiveGo(word: string, next: string): boolean {
  const bare = word.replace(/[^가-힣]+$/, '');
  return /^[가-힣]{2,}$/.test(bare) && bare.endsWith('고') && !GO_NOUNS.has(bare) && !AUX_AFTER_GO.test(next);
}

function trimClause(text: string): string {
  return text.replace(/^[\s.,;!?~]+|[\s.,;!?~]+$/g, '').trim();
}

/** 쉼표·;·+·&·문장부호, 접속사, "~는데", 연결 어미 "~고 "로 나누고, 넘치면 마지막 절에 합친다 */
function splitClauses(text: string): string[] {
  const parts: string[] = [];
  const chunks = text.replace(/[,;+&]/g, SEP).replace(/[.!?]+(?=\s|$)/g, SEP).split(SEP);
  for (const chunk of chunks) {
    const words = chunk.split(' ').filter(Boolean);
    let current: string[] = [];
    const flush = () => {
      const clause = trimClause(current.join(' '));
      if (clause) parts.push(clause);
      current = [];
    };
    words.forEach((word, i) => {
      if (CONJUNCTIONS.has(word)) {
        flush();
        return;
      }
      current.push(word);
      const next = words[i + 1];
      if (next !== undefined && (endsWithNde(word) || isConnectiveGo(word, next))) flush();
    });
    flush();
  }
  if (parts.length === 0) return [text];
  if (parts.length <= MAX_CLAUSES) return parts;
  return [...parts.slice(0, MAX_CLAUSES - 1), parts.slice(MAX_CLAUSES - 1).join(', ')];
}

/** 주어 자리에 자주 오지만 "누구"가 아닌 말(날짜·날씨·몸 상태·음식·장비 등) */
const NON_SUBJECT: ReadonlySet<string> = new Set([
  '오늘', '어제', '내일', '어젯밤', '오늘밤', '이번', '지금', '요즘', '최근', '경기', '날씨', '기온', '온도', '습도', '바람', '하늘',
  '햇빛', '햇볕', '조명', '안개', '미세먼지', '구속', '컨디션', '기분', '분위기', '몸상태', '표정', '타격감', '구위', '제구', '멘탈',
  '체력', '배트', '방망이', '글러브', '신발', '유니폼', '모자', '헬멧', '속옷', '수염', '머리', '커피', '짜장면', '라면', '치킨',
  '피자', '음식', '식사', '점심', '저녁', '아침', '간식', '야식', '낮잠', '시간', '그라운드', '마운드', '타석', '응원', '함성', '소리',
  '느낌', '징크스', '루틴', '부적', '생일', '이동', '버스', '비행기', '기차', '스트라이크존', '다리', '얼굴', '스윙', '타구', '투구',
  '사인', '실책', '점수', '점수차', '흐름', '기세', '상황', '이유', '사실', '그게', '이게', '저게', '이건', '그건',
]);
/** 조사처럼 끝나지만 그 자체가 낱말인 명사 */
const NOUN_LIKE_PARTICLE: ReadonlySet<string> = new Set(['고양이', '원숭이', '쌍둥이', '아이', '오이', '나이', '사이', '볼보이']);
const PARTICLE_WORD = /^(.+?)(께서|은|는|이|가)$/u;
/** 관형형 동사·형용사("먹었는", "좋아하는", "던지는")는 주어가 아니다 */
const VERB_ADNOMINAL = /(?:았|었|였|했|됐|왔|갔|봤|줬|쳤|졌|났|잤|싶|같|하|되)는$|(?:좋아하|싫어하|기다리|던지|마시|올라가|내려가|들어가|들어오|나오|나가|보이|싸우|이기|잡히|긁히|빼먹)(?:는|은)$/;

/** 절에서 "~는/은/이/가/께서" 앞 명사를 찾는다. 한 글자 한글 줄기(먹는·좋은·비가)와 NON_SUBJECT는 건너뛴다 */
function subjectOf(clause: string): string | null {
  for (const raw of clause.split(' ')) {
    const word = raw.replace(/[^\p{L}\p{N}]+$/u, '');
    if (NOUN_LIKE_PARTICLE.has(word) || VERB_ADNOMINAL.test(word)) continue;
    const m = PARTICLE_WORD.exec(word);
    if (!m) continue;
    const stem = m[1];
    if (/[가-힣]/.test(stem) && Array.from(stem).length < 2) continue;
    if (NON_SUBJECT.has(stem)) continue;
    return stem;
  }
  return null;
}

/** 주어가 없는 절은 앞 절의 subjectHint를 이어받는다 */
function toClauses(parts: readonly string[]): Clause[] {
  let previous: string | null = null;
  return parts.map((text) => {
    const subjectHint = subjectOf(text) ?? previous;
    previous = subjectHint;
    return { text, subjectHint };
  });
}

// ---------- 조립 ----------

export function prepareText(input: string): PreparedText {
  const cleaned = cleanText(input);
  if (cleaned === '') return { original: input, normalized: '', intensity: 0, tokens: [], numbers: [], clauses: [] };
  const rewriteTokens: string[] = [];
  const normalized = applyRewrites(cleaned.replace(SPACED_SYLLABLES, (m) => m.replace(/ /g, '')), rewriteTokens)
    .replace(/\s+/g, ' ')
    .trim();
  return {
    original: input,
    normalized,
    intensity: intensityOf(normalized),
    tokens: dedupe([...rewriteTokens, ...tokensOf(normalized)]),
    numbers: findNumbers(normalized),
    clauses: toClauses(splitClauses(normalized)),
  };
}
