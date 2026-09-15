import type { PromptContext } from '../types/domain';
import { prepareText, tokensOf } from './text';
import type { Clause, PreparedText } from './text';

/*
 * 안전 판정(CLAUDE.md, ADR-005, ADR-013 2단계). 순수 모듈이다.
 * - 실존 선수·선수 가족에게 걸린 범죄·음주·도박·폭력·약물·질병·부상·사망·사생활·성적 내용은 block.
 * - 민감어가 사람이 아닌 주체(관중·팬·치어리더·캐스터·동물·사물)에만 걸리면 allow.
 * - 민감어가 있는데 주체를 모르면 review(AI가 판단하고, AI가 없으면 거부한다).
 * - 비하 표현(욕설·혐오)은 주체와 상관없이 block. 외모 비하(뚱뚱·돼지)는 사람에게 걸릴 때만 막는다.
 * 부분 문자열 하나만으로 막지 않는다: 허용 관용구(마약김밥, 자살 스퀴즈, 타격감이 죽었다 …)를 먼저 지우고,
 * 야구 낱말과 겹치는 말(구속·사기·배팅·와인드업·담장)은 앞뒤 글자로 가린다.
 */

export type SafetyLevel = 'block' | 'review' | 'allow';
export type SensitiveCategory =
  | 'crime' | 'alcohol' | 'gambling' | 'violence' | 'drugs'
  | 'illness' | 'injury' | 'death' | 'privacy' | 'sexual' | 'slur';

export interface SafetyAssessment {
  level: SafetyLevel;
  category: SensitiveCategory | null;
  /** 사용자에게 보일 문구(allow면 빈 문자열) */
  reason: string;
  /** 판정에 쓴 표현(디버그·테스트용) */
  matched: string | null;
}

/** 민감 주제 거부 문구 (UI_GUIDE 문구: 거부) */
export const SENSITIVE_REASON = '선수 건강·사생활·범죄 이야기는 계산하지 않아요. 음식·잠·날씨·징크스로 바꿔 보세요.';
/** 비하 표현 거부 문구 */
export const SLUR_REASON = '사람을 깎아내리는 말은 계산하지 않아요.';

// ---------- 허용 관용구 ----------

/** 민감어처럼 보이지만 사람 이야기가 아닌 표현. 판정 전에 같은 길이의 공백으로 지운다 */
const ALLOWED_PHRASES: readonly RegExp[] = [
  /마약\s*(?:김밥|떡볶이|옥수수|빵|토스트|베개|쿠션|치킨|핫도그|계란|달걀|소스|라면|만두|족발|찜닭|커피|젤리|과자|간식|고구마|감자|닭강정|순대|국밥|김치|밥)|마약\s*같/g,
  /누드\s*(?:김밥|빼빼로)/g,
  /자살\s*(?:스퀴즈|번트)/g,
  /(?<![가-힣])(?:타격감|구위|방망이|배트|기세|분위기|구속|제구|타선|컨디션|멘탈|수비|직구|변화구|슬라이더|커브|포크|체인지업|볼끝|공끝|주자|타구|흐름|공|감|폼)(?:이|가|은|는|도)?\s*(?:완전\s*|다\s*|또\s*|아주\s*|진짜\s*|확\s*)?죽(?:었|어|음|네|는|을)/g,
  /이별\s*(?:노래|곡|발라드|송|가사|장면|드라마|영화)/g,
  /벙어리\s*장갑/g,
  /대머리\s*독수리/g,
  /등신대/g,
  /도박\s*같|도박수|도박적/g,
  /술술/g,
  /죽겠|죽을\s*(?:것\s*같|맛|뻔)|죽여준|죽이네|죽인다|죽이는/g,
  /새끼\s*(?:손가락|발가락|고양이|강아지)/g,
  /돼지\s*(?:국밥|고기|갈비|껍데기|불고기|국|띠|저금통|꿈)/g,
  /뚱뚱한\s*(?:배트|방망이|글러브|지갑|가방|책|빵|햄버거|고양이|강아지|곰|공)/g,
  /시발점/g,
  /헤어\s*(?:스타일|밴드|핀|컬러|드라이어)/g,
  /장애인석|장애물/g,
  /살인\s*미소|살인적/g,
  /키스톤/g,
  /와인드\s*업/g,
];

function maskAllowed(text: string): string {
  let out = text;
  for (const re of ALLOWED_PHRASES) out = out.replace(re, (m) => ' '.repeat(m.length));
  return out;
}

// ---------- 민감어 사전 ----------

/** 욕설·혐오 표현(초성 포함): 주체와 상관없이 막는다 */
const SLUR_ALWAYS = /병신|븅신|빙신|ㅂㅅ|ㅄ|시발(?!점)|씨발|씨바|씨빨|ㅅㅂ|ㅆㅂ|좆|개새끼|개새(?!벽)|씹새|씹할|씹련|쌍놈|쌍년|(?<!\d\s?)개년|개놈|미친\s*놈|미친\s*년|또라이|돌아이|등신(?!대)|지랄|닥쳐|찐따|저능아|정신병자|정박아|(?<![가-힣])애자(?![가-힣])|귀머거리|절름발이|앉은뱅이|벙어리(?!\s*장갑)|난쟁이|짱깨|짱개|쪽바리|깜둥이|흑형|조센징|전라디언|멍청도|쌍도(?!루)|김치녀|된장녀|한남충|메갈|보슬아치|창녀|맘충|틀딱|급식충|똥꼬충|(?<![가-힣])(?:이|저|그)\s*새끼|새끼야|ㄱㅅㄲ|ㅅㄲ|ㅁㅊㄴ|호모(?!\s*사피엔스)|\b(?:fuck|fucking|bitch|retard|faggot|nigger|nigga)\b|🖕/u;

/** 외모 비하: 사람에게 걸릴 때만 막는다(뚱뚱한 배트, 돼지국밥은 사람 이야기가 아니다) */
const SLUR_BODY = /뚱뚱|뚱보|뚱땡이|(?<![가-힣])돼지|못생|추남|추녀|대머리(?!\s*독수리)/;

/** 범주 사전. 한 표현이 여러 범주에 걸리면 앞 범주를 쓴다(음주운전은 범죄) */
const CATEGORY_RULES: ReadonlyArray<readonly [SensitiveCategory, RegExp]> = [
  [
    'crime',
    /음주\s*운전|뺑소니|무면허|체포|입건|기소|징역|벌금형|전과\s*\d*\s*(?:범|자)|전과가\s*있|범죄|절도|횡령|탈세|협박|혐의|고발|피소|재판|감옥|교도소|구치소|수감|영장|구속\s*(?:됐|되었|돼|영장|수감|기소)|사기\s*(?:꾼|죄|혐의|사건|당했|를\s*쳤)|수사(?!자)|고소(?!한|해|하)|경찰(?:에|이|서|\s*조사)|불법/,
  ],
  ['gambling', /도박|토토|(?:승부|경기)\s*조작|조작\s*(?:의혹|논란|혐의)|베팅|카지노|바카라|경마/],
  ['drugs', /마약|대마초|대마(?!도)|필로폰|코카인|헤로인|엑스터시|마리화나|프로포폴|스테로이드|도핑|약물|환각|향정신성|투약/],
  ['sexual', /성관계|섹스|야동|음란|성추행|성폭행|성폭력|성희롱|성매매|성범죄|몰카|몰래\s*카메라|알몸|누드|포르노|자위|원나잇|성기/],
  ['violence', /폭행|폭력|학폭|주먹질|멱살|칼부림|흉기|살인|폭언|괴롭힘|왕따|따돌림|구타|린치/],
  [
    'alcohol',
    /소주(?!제)|맥주|막걸리|양주(?!시)|와인|위스키|보드카|사케|샴페인|폭탄주|소맥|과음|음주|숙취|만취|취기|술에\s*취|(?<!(?:를|을)\s?)취했|취해서|술자리|술판|술집|술값|(?<![가-힣])술(?![술래수어])/,
  ],
  [
    'death',
    /사망|숨졌|숨을\s*거|별세|돌아가(?:셨|심|신)|부고|장례|빈소|조문|유족|영결식|고인(?!물)|하늘나라|세상을\s*떠|극단적\s*선택|자살|(?<![가-힣])죽음|죽었|추모/,
  ],
  [
    'injury',
    /부상|다쳤|다치|다친|다쳐|인대|햄스트링|골절|염좌|파열|탈구|근육통|통증|타박상|찰과상|깁스|재활|수술|토미존|출혈|피가\s*났|절뚝|코피|쥐가\s*(?:났|나서|남)|(?<![가-힣])담\s*(?:이\s*)?(?:걸|결리|결렸|왔|와서)|(?:뼈|손가락|발가락|팔|다리|갈비뼈|코뼈|손목|발목|쇄골|팔꿈치|어깨|허리|무릎)(?:이|가|를|도)?\s*(?:부러|금이\s*갔|나갔|빠졌|꺾였)/,
  ],
  [
    'illness',
    /감기(?=$|[\s에가도로약몸기걸])|몸살|독감|코로나|확진|(?<![가-힣])암(?=$|\s|[이에을은도]|진단|걸|투병|판정|세포|환자)|(?:위|간|폐|대장|갑상선|유방|췌장|혈액|피부|뇌|골|전립선|자궁)암|백혈병|우울증|공황|불안\s*장애|조울증|조현병|정신과|치매|당뇨|고혈압|심장병|심근경색|뇌졸중|희귀병|난치병|투병|입원|퇴원|응급실|구급차|링거|수액|진통제|수면제|항우울제|신경\s*안정제|(?<![가-힣])약\s*(?:을\s*)?(?:먹|복용|처방)|병원(?:에|에서)?\s*(?:입원|실려|갔|다녀|진료|치료|검사)|아프(?!리카)|아파(?!트)|아팠|아픈|아플|아픔|두통|복통|배탈|설사\s*(?:를|가|병|약|했|났|중)|장염|식중독|구토|(?<![가-힣])토했|어지럼|빈혈|탈수|열사병|일사병|쓰러졌|고열|미열|발열|열이\s*(?:나|났|난|있)|알레르기|비염|치료\s*중|치료를\s*받/,
  ],
  [
    'privacy',
    /연애|열애|사귀|사귄|사귈|사겼|여자\s*친구|남자\s*친구|여친|남친|(?<!장)애인(?!석)|썸\s*(?:을\s*)?(?:타|탔|탄|탈)|소개팅|(?<!업)데이트|결별|이별|헤어(?:졌|지|짐|진)|이혼|재혼|파혼|불륜|외도|바람\s*(?:을\s*)?(?:피(?:다|웠|움|운|우|는|고|면|던|울|워|다가)|폈)|모텔|러브\s*호텔|집\s*주소|주소를?\s*(?:알아|털|공개|찾)|(?:전화|휴대폰|핸드폰)\s*번호|개인\s*정보|신상\s*(?:털|공개|정보)|사생활|스캔들|임신|낙태|(?<![가-힣])게이(?![트지머밍])|레즈|동성애|트랜스젠더|커밍아웃|키스|뽀뽀|짝사랑|빚더미|파산|사채|신용\s*불량/,
  ],
];

// ---------- 주체 ----------

/** 사람 주체: 선수·스태프 역할어와 선수 가족 */
const PERSON_WORDS = /투수|타자|선수|포수|감독|코치|대타|대주자|주자|마무리|선발|에이스|캡틴|유격수|내야수|외야수|좌익수|중견수|우익수|[1-3]루수|루키|베테랑|심판|주심|구심|루심|단장|트레이너|불펜|어머니|어머님|엄마|아버지|아버님|아빠|아내|와이프|남편|아들|(?<![가-힣])딸(?![기꾹])|(?<![가-힣])형(?=$|[^가-힣]|[이은도님네한])|누나|동생|할머니|할아버지|가족|부모|삼촌|(?<![가-힣])이모(?!티콘|지)|고모|조카|사촌|처제|형수|자녀|손자|손녀/;

/** 사람이 아닌 주체: 관중·팬·치어리더·캐스터, 동물·반려동물, 사물 */
const NON_PERSON_WORDS = /관중|관객|팬(?!티)|응원단|응원석|외야석|내야석|치어리더|캐스터|아나운서|마스코트|볼보이|볼걸|아저씨|아줌마|시민|손님|강아지|반려견|반려묘|반려동물|애완견|애완동물|고양이|햄스터|비둘기|까마귀|갈매기|참새|앵무새|토끼|거북이|물고기|금붕어|벌레|모기|나방|파리|캐릭터|식물|화분|선인장|나무|휴대폰|핸드폰|배터리|노트북|컴퓨터|자동차|에어컨|전광판|조명탑|게임|배트|방망이|글러브|타구/;

type Kind = 'person' | 'nonPerson';

interface Names {
  full: ReadonlySet<string>;
  given: ReadonlySet<string>;
  /** 문장 속 선수 이름(성+이름, 세 글자 이름의 이름만) */
  re: RegExp | null;
}

const NO_NAMES: Names = { full: new Set(), given: new Set(), re: null };
const NAMES_CACHE = new WeakMap<PromptContext, Names>();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byLengthDesc = (a: string, b: string) => b.length - a.length;

/** 장면 선수·타순·장면 밖 선수 이름 */
function namesOf(ctx: PromptContext | null): Names {
  if (!ctx) return NO_NAMES;
  const cached = NAMES_CACHE.get(ctx);
  if (cached) return cached;
  const full = new Set<string>();
  const list = [
    ctx.batter.name,
    ctx.pitcher.name,
    ...ctx.lineupNames,
    ...ctx.battingLineup.map((entry) => entry.name),
    ...ctx.fieldingLineup.map((entry) => entry.name),
    ...ctx.otherPlayers.map((player) => player.name),
  ];
  for (const raw of list) {
    const name = raw.trim().toLowerCase();
    if (/[가-힣]/.test(name) ? Array.from(name).length >= 2 : name.length >= 3) full.add(name);
  }
  const given = new Set<string>();
  for (const name of full) if (/^[가-힣]{3}$/.test(name)) given.add(name.slice(1));
  const patterns: string[] = [];
  if (full.size > 0) patterns.push(`(?<![가-힣a-z])(?:${[...full].sort(byLengthDesc).map(escapeRe).join('|')})`);
  if (given.size > 0) {
    patterns.push(`(?<![가-힣])(?:${[...given].sort(byLengthDesc).map(escapeRe).join('|')})(?=$|[^가-힣]|[이가은는을를도의에한랑와과께선형님아야])`);
  }
  const names: Names = { full, given, re: patterns.length > 0 ? new RegExp(patterns.join('|')) : null };
  NAMES_CACHE.set(ctx, names);
  return names;
}

function hasPerson(text: string, names: Names): boolean {
  return (names.re !== null && names.re.test(text)) || PERSON_WORDS.test(text);
}

/** 낱말 하나(subjectHint)의 주체 종류. 모르면 null */
function wordKind(word: string, names: Names): Kind | null {
  const w = word.toLowerCase();
  if (names.full.has(w) || names.given.has(w) || hasPerson(w, names)) return 'person';
  return NON_PERSON_WORDS.test(w) ? 'nonPerson' : null;
}

/**
 * 절의 주체 종류: 사람 언급이 있으면 사람, 사람이 아닌 주체만 있으면 그것.
 * 둘 다 없으면 주어 낱말(이 절에 있으면 그 낱말만 보고, 앞 절에서 이어받았으면 그 낱말 → 앞 절 순서). 모르면 null
 */
function clauseKind(scan: string, hint: string | null, names: Names, previous: Kind | null): Kind | null {
  if (hasPerson(scan, names)) return 'person';
  if (NON_PERSON_WORDS.test(scan)) return 'nonPerson';
  if (hint === null) return previous;
  const hintKind = wordKind(hint, names);
  return scan.includes(hint) ? hintKind : hintKind ?? previous;
}

// ---------- 판정 ----------

interface Hit {
  category: SensitiveCategory;
  matched: string;
}

function sensitiveHit(scan: string, clause: Clause, prepared: PreparedText): Hit | null {
  for (const [category, re] of CATEGORY_RULES) {
    const m = re.exec(scan);
    if (m) return { category, matched: m[0].trim() };
  }
  const fever = prepared.numbers.find((n) => n.unit === 'celsius' && /열|체온/.test(n.raw) && clause.text.includes(n.raw));
  if (fever) return { category: 'illness', matched: fever.raw };
  const body = SLUR_BODY.exec(scan);
  return body ? { category: 'slur', matched: body[0] } : null;
}

const reasonOf = (category: SensitiveCategory) => (category === 'slur' ? SLUR_REASON : SENSITIVE_REASON);

export function assessSafety(prepared: PreparedText, ctx: PromptContext | null): SafetyAssessment {
  if (prepared.normalized === '') return { level: 'allow', category: null, reason: '', matched: null };

  const slur = SLUR_ALWAYS.exec(maskAllowed(`${prepared.normalized} ${prepared.tokens.join(' ')}`));
  if (slur) return { level: 'block', category: 'slur', reason: SLUR_REASON, matched: slur[0].trim() };

  const names = namesOf(ctx);
  let review: SafetyAssessment | null = null;
  let previous: Kind | null = null;
  for (const clause of prepared.clauses) {
    const scan = maskAllowed(`${clause.text} ${tokensOf(clause.text).join(' ')}`);
    const kind = clauseKind(scan, clause.subjectHint, names, previous);
    previous = kind;

    const hit = sensitiveHit(scan, clause, prepared);
    if (!hit) continue;
    if (kind === 'person') return { level: 'block', category: hit.category, reason: reasonOf(hit.category), matched: hit.matched };
    if (kind === null) review ??= { level: 'review', category: hit.category, reason: reasonOf(hit.category), matched: hit.matched };
  }
  return review ?? { level: 'allow', category: null, reason: '', matched: null };
}

/** 호환: assessSafety(prepareText(text), null).level === 'block' */
export function checkSensitive(text: string): { blocked: boolean; reason: string } {
  const assessment = assessSafety(prepareText(text), null);
  return assessment.level === 'block' ? { blocked: true, reason: assessment.reason } : { blocked: false, reason: '' };
}
