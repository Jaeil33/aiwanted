import type { KnobId, MeasuredId, Scope, Subject } from '../types/domain';
import { DB_CONCEPTS } from './lexiconDb';
import { tokensOf } from './text';
import type { Clause, NumberUnit, PreparedText } from './text';

/*
 * 개념 사전(ADR-013 5단계). 순수 데이터 + 매칭. 확률 숫자를 담지 않는다: 손잡이·세기(−2..2)·실측 입력 기본값만 둔다(ADR-003).
 * 민감 주제(음주·질병·부상·사생활 등)는 개념으로 두지 않는다. 안전 판정(safety.ts)이 먼저 거른다.
 * 사람 이야기 개념은 같은 표현을 타자용·투수용 손잡이로 나눈 변형(group)으로 두고, 규칙 해석(rules.ts)이 대상에 맞는 변형을 고른다.
 */

export type ConceptCategory =
  | 'food' | 'sleep' | 'mood' | 'gear' | 'jinx' | 'family' | 'travel'
  | 'weather' | 'crowd' | 'command' | 'slang' | 'body' | 'luck'
  | 'daily' | 'hobby' | 'animal' | 'tech' | 'event' | 'baseball' | 'ballpark'
  | 'meme' | 'fortune' | 'study' | 'fashion' | 'money';

type Strength = 1 | 2 | -1 | -2;

export interface Concept {
  id: string;
  category: ConceptCategory;
  /** 정리된 절 문장과 그 절의 영어·이모지 토큰에서 찾는다(g 플래그 없음) */
  patterns: readonly RegExp[];
  knob: KnobId;
  /** SUBJECTS_FOR[KNOB_META[knob].who] 안에 있다 */
  defaultSubject: Subject;
  /** 긍정 문장일 때 세기 */
  strength: Strength;
  /** 부정어가 붙으면 방향을 뒤집을지(flip) 효과를 없앨지(cancel) */
  negation: 'flip' | 'cancel';
  evidence: 'plausible' | 'fun';
  scope: Scope;
  measured?: { variable: MeasuredId; defaultValue: number; unit?: NumberUnit };
  /** 해설 템플릿: {what} 찾은 표현, {who} 대상 이름표 */
  comment: string;
  /** 60자 이하 */
  why: string;
  /** 같은 표현을 대상별 손잡이로 나눈 변형 묶음(타자·투수·팀). 규칙 해석이 대상에 맞는 하나를 고른다 */
  group?: string;
  /** 이 개념이 매칭되면 뺄 개념 id 또는 group(더 넓은 개념) */
  excludes?: readonly string[];
  /** 숫자 구간으로도 찾는다: 절에 unit 숫자가 [min, max] 안에 있고 near가 절에 있으면 */
  quantity?: { unit: NumberUnit; min?: number; max?: number; near: RegExp };
}

export interface ConceptMatch {
  concept: Concept;
  matched: string;
  negated: boolean;
}

type Base = Omit<Concept, 'id' | 'knob' | 'defaultSubject' | 'strength' | 'comment' | 'group'>;
type Variant = readonly [knob: KnobId, strength: Strength, comment: string];

/** 타자(batter 손잡이)·투수(pitcher 손잡이) 변형 한 쌍. 투수 변형 id는 `${id}-p` */
function person(id: string, base: Base, batter: Variant, pitcher: Variant): Concept[] {
  return [
    { id, ...base, knob: batter[0], defaultSubject: 'batter', strength: batter[1], comment: batter[2], group: id },
    { id: `${id}-p`, ...base, knob: pitcher[0], defaultSubject: 'pitcher', strength: pitcher[1], comment: pitcher[2], group: id },
  ];
}

/** 투수(nerve 등) 기본 + 타자 변형 `${id}-b` */
function pitcherFirst(id: string, base: Base, pitcher: Variant, batter: Variant): Concept[] {
  return [
    { id, ...base, knob: pitcher[0], defaultSubject: 'pitcher', strength: pitcher[1], comment: pitcher[2], group: id },
    { id: `${id}-b`, ...base, knob: batter[0], defaultSubject: 'batter', strength: batter[1], comment: batter[2], group: id },
  ];
}

/** 팀 분위기(mood) 기본 + 타자 집중력 `${id}-b` + 투수 멘탈 `${id}-p` */
function teamMood(id: string, base: Base, strength: Strength, team: 'battingTeam' | 'fieldingTeam', comments: readonly [team: string, batter: string, pitcher: string]): Concept[] {
  return [
    { id, ...base, knob: 'mood', defaultSubject: team, strength, comment: comments[0], group: id },
    { id: `${id}-b`, ...base, knob: 'focus', defaultSubject: 'batter', strength, comment: comments[1], group: id },
    { id: `${id}-p`, ...base, knob: 'nerve', defaultSubject: 'pitcher', strength, comment: comments[2], group: id },
  ];
}

const SLEEP_NEAR = /잤|자고|잠|수면|slept|sleep/;
const CAFFEINE_NEAR = /커피|아메리카노|라떼|에스프레소|카페인|에너지|핫식스|레드불/;

/** 손으로 다듬은 핵심 개념 */
export const CORE_CONCEPTS: readonly Concept[] = [
  // ---------- 음식 ----------
  ...person(
    'food-heavy',
    {
      category: 'food',
      patterns: [/짜장면|짜장|짬뽕|탕수육|곱빼기|과식|폭식|야식|배\s*(?:가\s*)?(?:불러|부르|부름|빵빵|터지)|배부르|배부름|배불|치킨|피자|햄버거|삼겹살|떡볶이|(?<![가-힣])라면|신라면|컵라면|족발|보쌈|곱창|뷔페|(?:두|세|네)\s*그릇|[2-9]\s*인분|(?:두|세)\s*마리/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '배가 부르면 몸이 무거워진다는 가정',
    },
    ['focus', -1, "'{what}' 든든하게 먹은 {who}, 몸이 무거워진다고 봤어요"],
    ['stamina', -1, "'{what}' 먹고 올라온 {who}, 뒤로 갈수록 힘이 빠진다고 봤어요"],
  ),
  ...person(
    'food-hearty',
    {
      category: 'food',
      patterns: [/보양식|보양|삼계탕|장어|홍삼|든든|국밥|뚝딱|밥\s*(?:을\s*)?잘\s*먹|아침\s*(?:을\s*)?(?:든든|챙겨)|영양\s*(?:만점|보충)|닭가슴살|곰탕|설렁탕|추어탕|(?<![가-힣])고기(?![가-힣])/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '든든하게 먹으면 힘이 난다는 가정',
    },
    ['focus', 1, "'{what}' 챙겨 먹은 {who}, 힘이 난다고 봤어요"],
    ['stamina', 1, "'{what}' 한 그릇이면 {who} 끝까지 버틴다고 봤어요"],
  ),
  ...person(
    'food-spicy',
    {
      category: 'food',
      patterns: [/마라(?!톤)|매운|매워|맵다|불닭|엽떡|청양고추|핫소스|매운맛/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '매운 걸 먹으면 속이 뜨거워 흐트러진다는 가정',
    },
    ['focus', -1, "'{what}' 먹은 {who}, 속이 불타 집중이 흐트러진다고 봤어요"],
    ['control', -1, "'{what}' 먹은 {who}, 땀이 나서 손끝이 흔들린다고 봤어요"],
  ),
  ...person(
    'food-caffeine',
    {
      category: 'food',
      patterns: [/커피|아메리카노|라떼|에스프레소|카페인|에너지\s*(?:음료|드링크)|에너지음료|핫식스|레드불|박카스|샷\s*추가/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '카페인이 들어가면 눈이 번쩍 뜨인다는 가정',
    },
    ['focus', 1, "'{what}' 한 잔에 {who} 눈이 번쩍 뜨였다고 봤어요"],
    ['stuff', 1, "'{what}' 마신 {who}, 공끝이 살아난다고 봤어요"],
  ),
  ...person(
    'food-caffeine-overdose',
    {
      category: 'food',
      patterns: [/카페인\s*과다|커피\s*폭탄|커피\s*(?:를\s*)?들이부/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '카페인이 너무 많으면 손이 떨린다는 가정',
      excludes: ['food-caffeine'],
      quantity: { unit: 'cup', min: 4, near: CAFFEINE_NEAR },
    },
    ['focus', -1, "'{what}'는 과했어요, {who} 심장만 두근거린다고 봤어요"],
    ['control', -1, "'{what}' 들이켠 {who}, 손이 떨려 제구가 흔들린다고 봤어요"],
  ),
  ...person(
    'food-hungry',
    {
      category: 'food',
      patterns: [/굶|배고프|배고파|배고픔|공복|끼니\s*(?:를\s*)?(?:거르|걸러)|밥\s*(?:을\s*)?(?:못|안)\s*먹|쫄쫄/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '배가 고프면 힘이 모자란다는 가정',
    },
    ['focus', -1, "'{what}' 상태의 {who}, 머리가 핑 돈다고 봤어요"],
    ['stamina', -1, "'{what}' 상태의 {who}, 연료가 모자란다고 봤어요"],
  ),
  ...person(
    'food-sweet',
    {
      category: 'food',
      patterns: [/바나나|초콜릿|초코|사탕|당\s*충전|단\s*거|디저트|케이크|아이스크림|젤리|꿀물|에너지바/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '당이 들어가면 반짝 힘이 난다는 가정',
    },
    ['focus', 1, "'{what}'로 당 충전한 {who}, 반짝 힘이 난다고 봤어요"],
    ['stamina', 1, "'{what}'로 당 충전한 {who}, 한 타자 더 버틴다고 봤어요"],
  ),

  // ---------- 잠 ----------
  ...person(
    'sleep-short',
    {
      category: 'sleep',
      patterns: [/못\s*잤|못\s*자|잠\s*(?:을\s*)?(?:못|설쳤|설침|설치|부족|모자라)|밤\s*(?:을\s*)?(?:샜|새웠|새고)|밤샘|밤새|새벽까지|날\s*(?:을\s*)?샜|한숨도\s*못|불면(?!증)|뜬눈|잠\s*(?:이\s*)?(?:안|못)\s*(?:와|옴|왔)/],
      negation: 'flip',
      evidence: 'plausible',
      scope: 'game',
      why: '잠이 모자라면 반응과 체력이 떨어져요',
      quantity: { unit: 'hour', max: 4.5, near: SLEEP_NEAR },
    },
    ['focus', -1, "'{what}' {who}, 공이 한 박자 늦게 보인다고 봤어요"],
    ['stamina', -1, "'{what}' {who}, 이닝이 갈수록 힘이 빠진다고 봤어요"],
  ),
  ...person(
    'sleep-good',
    {
      category: 'sleep',
      patterns: [/푹\s*(?:잤|자|잠)|꿀잠|숙면|잘\s*잤|잠\s*(?:을\s*)?(?:푹|잘)\s*(?:잤|자)|개운/],
      negation: 'flip',
      evidence: 'plausible',
      scope: 'game',
      why: '푹 자고 나오면 몸이 가볍다는 가정',
      quantity: { unit: 'hour', min: 8, near: SLEEP_NEAR },
    },
    ['focus', 1, "'{what}' {who}, 눈이 맑아 공이 잘 보인다고 봤어요"],
    ['stamina', 1, "'{what}' {who}, 어깨가 싱싱하다고 봤어요"],
  ),
  ...person(
    'sleep-nap',
    {
      category: 'sleep',
      patterns: [/낮잠|쪽잠|토막잠|잠깐\s*(?:잤|눈\s*붙)|눈\s*(?:좀\s*)?붙였/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '짧은 낮잠은 머리를 맑게 한다는 가정',
    },
    ['focus', 1, "'{what}'으로 충전한 {who}, 머리가 맑아졌다고 봤어요"],
    ['stamina', 1, "'{what}'으로 충전한 {who}, 한 이닝 더 간다고 봤어요"],
  ),
  ...person(
    'sleep-oversleep',
    {
      category: 'sleep',
      patterns: [/늦잠|지각|알람\s*(?:을\s*)?못\s*들|늦게\s*일어/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '허둥지둥 나오면 몸이 덜 풀린다는 가정',
    },
    ['focus', -1, "'{what}'으로 허둥지둥 나온 {who}, 몸이 덜 풀렸다고 봤어요"],
    ['stamina', -1, "'{what}'으로 허둥지둥 나온 {who}, 준비가 덜 됐다고 봤어요"],
  ),

  // ---------- 몸 상태(민감하지 않은 것만) ----------
  ...person(
    'body-tired',
    {
      category: 'body',
      patterns: [/피곤|피로|지쳤|지친|지침|녹초|기진맥진|졸려|졸림|졸음|졸리|졸았|눈꺼풀|방전|체력\s*(?:이\s*)?(?:바닥|고갈|떨어|방전)|힘\s*(?:이\s*)?(?:빠졌|없)|퀭/],
      negation: 'flip',
      evidence: 'plausible',
      scope: 'game',
      why: '피곤하면 반응과 체력이 떨어져요',
    },
    ['focus', -1, "'{what}' 기색의 {who}, 방망이가 한 템포 늦는다고 봤어요"],
    ['stamina', -1, "'{what}' 기색의 {who}, 공에 힘이 덜 실린다고 봤어요"],
  ),
  ...person(
    'body-good',
    {
      category: 'body',
      patterns: [/컨디션\s*(?:이\s*)?(?:최고|최상|좋|굿|짱|만점|완벽)|몸\s*(?:이\s*)?(?:가볍|가벼|날아갈)|몸\s*상태\s*(?:가\s*)?(?:최고|좋)|쌩쌩|팔팔|활력|기운\s*(?:이\s*)?(?:넘|난다|좋)/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '컨디션이 좋으면 몸이 먼저 반응한다는 가정',
    },
    ['focus', 1, "'{what}'인 {who}, 몸이 먼저 반응한다고 봤어요"],
    ['stamina', 1, "'{what}'인 {who}, 끝까지 공에 힘이 실린다고 봤어요"],
  ),
  ...person(
    'body-heavy',
    {
      category: 'body',
      patterns: [/컨디션\s*(?:이\s*)?(?:안\s*좋|별로|나쁨|나빠|최악|난조|엉망|bad|저조)|몸\s*(?:이\s*)?(?:무거|무겁|찌뿌둥|뻐근|천근만근)|몸\s*상태\s*(?:가\s*)?(?:별로|안\s*좋)|찌뿌둥|나른/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '몸이 무거우면 동작이 둔해진다는 가정',
    },
    ['focus', -1, "'{what}' {who}, 스윙이 둔해진다고 봤어요"],
    ['stamina', -1, "'{what}' {who}, 공이 무겁게 안 나간다고 봤어요"],
  ),
  {
    id: 'body-sweat',
    category: 'body',
    patterns: [/땀\s*(?:범벅|을?\s*뻘뻘|이?\s*줄줄|을?\s*많이|이?\s*많|흘|이?\s*나|에\s*젖)|땀방울|(?<![가-힣])땀(?![가-힣])|손에\s*땀|손이\s*미끄/],
    knob: 'slick',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'pa',
    comment: "'{what}' 손끝이 미끄러워 공이 빠진다고 봤어요",
    why: '땀에 젖은 손은 공을 채기 어려워요',
  },
  ...person(
    'body-distracted',
    {
      category: 'body',
      patterns: [/딸꾹질|재채기|하품|모기|벌레|날파리|(?<![가-힣])파리(?![가-힣])|나방|먼지\s*(?:가\s*)?(?:눈|들어)|눈에\s*(?:뭐가|먼지|벌레)|가려워|간지러/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '순간 집중이 깨지는 방해 요소',
    },
    ['focus', -1, "'{what}' 때문에 {who} 집중이 툭 끊긴다고 봤어요"],
    ['control', -1, "'{what}' 때문에 {who} 릴리스가 흔들린다고 봤어요"],
  ),
  {
    id: 'body-muscle',
    category: 'body',
    patterns: [/근육|벌크업|웨이트|헬스|힘\s*(?:이\s*)?(?:넘|세|좋|솟)|파워\s*(?:업|넘|좋)|(?<![가-힣])힘(?![가-힣])/],
    knob: 'power',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 타구에 힘이 더 실린다고 봤어요",
    why: '힘이 넘치면 타구가 멀리 간다는 가정',
  },
  {
    id: 'body-pitch-count',
    category: 'body',
    patterns: [/투구\s*수\s*(?:가\s*)?(?:많|늘|이미|벌써|\d)|투구수\s*(?:가\s*)?(?:많|늘|이미|벌써|\d)|(?:[89]\d|1[0-4]\d)\s*구\s*(?:째|넘|던)|공\s*(?:을\s*)?많이\s*던/],
    knob: 'stamina',
    defaultSubject: 'pitcher',
    strength: -1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}' {who}, 어깨가 슬슬 무거워진다고 봤어요",
    why: '공을 많이 던지면 구위가 떨어져요',
  },
  {
    id: 'body-hot-streak',
    category: 'body',
    patterns: [/타율\s*(?:이\s*)?[3-9]\s*할|[3-9]할\s*(?:타자|대|타율)|멀티\s*히트|연속\s*안타|안타\s*행진|타격\s*(?:감\s*)?(?:상승|폭발)/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}' {who}, 요즘 공이 수박만 하게 보인다고 봤어요",
    why: '최근 잘 맞는 타자는 감이 이어진다는 가정',
  },
  {
    id: 'body-eye-bad',
    category: 'body',
    patterns: [/눈\s*(?:이\s*)?(?:침침|뻑뻑|피로|흐릿)|렌즈\s*(?:가\s*)?(?:빠졌|말라|불편|안\s*맞)|공이?\s*(?:잘\s*)?안\s*보/],
    knob: 'eye',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' {who}, 볼과 스트라이크 구분이 흐려진다고 봤어요",
    why: '눈이 불편하면 공을 고르기 어렵다는 가정',
  },
  {
    id: 'body-fielders-tired',
    category: 'body',
    patterns: [/(?:수비수|야수|내야수|외야수|내야진|외야진|수비진)\s*(?:들\s*)?(?:이\s*)?(?:지쳤|피곤|방전|헉헉)|수비\s*(?:시간|이닝)\s*(?:이\s*)?길/],
    knob: 'defense',
    defaultSubject: 'fieldingTeam',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who} 발이 한 발씩 늦는다고 봤어요",
    why: '지친 야수는 타구 반응이 늦다는 가정',
  },

  // ---------- 기분 ----------
  ...person(
    'mood-excited',
    {
      category: 'mood',
      patterns: [/설레|설렘|들떴|들뜬|들뜸|신나|신남|신났|두근|기대\s*(?:돼|된|중|감)|흥분|텐션\s*(?:업|높|최고)/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '신이 나면 몸이 가볍다는 가정',
    },
    ['focus', 1, "'{what}' {who}, 발걸음이 가볍다고 봤어요"],
    ['nerve', 1, "'{what}' {who}, 마운드가 즐겁다고 봤어요"],
  ),
  ...person(
    'mood-nervous',
    {
      category: 'mood',
      patterns: [/긴장|떨려|떨림|떨고|떨린|떨었|덜덜|쫄았|쫄림|쫄려|초조|불안|조마조마|압박감|부담감|부담\s*(?:돼|된|감)|멘붕/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '마음이 흔들리면 실수가 늘어난다는 가정',
    },
    ['focus', -1, "'{what}' {who}, 어깨에 힘이 들어간다고 봤어요"],
    ['nerve', -1, "'{what}' {who}, 위기에서 손이 굳는다고 봤어요"],
  ),
  ...person(
    'mood-angry',
    {
      category: 'mood',
      patterns: [/화남|화나|화났|화가\s*(?:나|났)|열받|빡쳐|빡침|빡친|빡쳤|킹받|짜증|분노|열불|욱했/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '화가 나면 힘만 들어간다는 가정',
    },
    ['focus', -1, "'{what}' {who}, 힘만 잔뜩 들어간 스윙이 나온다고 봤어요"],
    ['control', -1, "'{what}' {who}, 힘으로 던지다 공이 날린다고 봤어요"],
  ),
  ...person(
    'mood-confident',
    {
      category: 'mood',
      patterns: [/자신감|자신\s*있|자신만만|여유\s*(?:만만|있|롭)|기세\s*(?:가\s*)?(?:좋|등등|올랐)|확신|자부심|당당/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '자신감은 과감한 플레이를 부른다는 가정',
    },
    ['focus', 1, "'{what}' {who}, 초구부터 과감하다고 봤어요"],
    ['nerve', 1, "'{what}' {who}, 위기에서도 흔들림이 없다고 봤어요"],
  ),
  ...person(
    'mood-happy',
    {
      category: 'mood',
      patterns: [/기분\s*(?:이\s*)?(?:좋|최고|짱|굿|째|날아갈)|행복|기뻐|기쁨|기쁘|싱글벙글|웃음|웃었|신이\s*났|즐거/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '기분이 좋으면 집중이 잘 된다는 가정',
    },
    ['focus', 1, "'{what}' {who}, 몸이 가볍게 돈다고 봤어요"],
    ['nerve', 1, "'{what}' {who}, 마운드에서 여유가 생긴다고 봤어요"],
  ),
  ...person(
    'mood-sad',
    {
      category: 'mood',
      patterns: [/슬프|슬픔|슬퍼|속상|서운|눈물|울었|울고|울컥|기분\s*(?:이\s*)?(?:안\s*좋|별로|꿀꿀|나쁨|나빠|최악|다운|구려)|의기소침|풀\s*죽/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '마음이 가라앉으면 몸도 처진다는 가정',
    },
    ['focus', -1, "'{what}' {who}, 방망이에 힘이 안 실린다고 봤어요"],
    ['nerve', -1, "'{what}' {who}, 흔들리는 마음이 공에 실린다고 봤어요"],
  ),
  ...teamMood(
    'mood-hate',
    {
      category: 'mood',
      patterns: [/악플|악성\s*댓글|비난\s*댓글|욕\s*먹|혹평|조롱|비아냥/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '나쁜 말을 들으면 마음이 흔들린다는 가정',
    },
    -1,
    'battingTeam',
    ["'{what}'에 {who} 더그아웃 공기가 무거워졌다고 봤어요", "'{what}'을 본 {who}, 괜히 이를 악문다고 봤어요", "'{what}'을 본 {who}, 멘탈이 흔들린다고 봤어요"],
  ),

  // ---------- 장비 ----------
  {
    id: 'gear-new-bat',
    category: 'gear',
    patterns: [/새\s*(?:배트|방망이)|(?:배트|방망이)\s*(?:를|을)?\s*(?:바꿨|교체|새로)|배트\s*(?:를\s*)?샀/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' 들고 나온 {who}, 공이 착착 붙는다고 봤어요",
    why: '새 장비 효과라는 가정',
  },
  {
    id: 'gear-broken-bat',
    category: 'gear',
    patterns: [/(?:배트|방망이)\s*(?:가\s*)?(?:부러|깨|금\s*갔|두\s*동강)/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' {who}, 손에 익은 방망이를 잃었다고 봤어요",
    why: '익숙한 배트가 없으면 감이 흔들린다는 가정',
  },
  ...person(
    'gear-glove',
    {
      category: 'gear',
      patterns: [/새\s*(?:글러브|장갑|미트)|(?:글러브|장갑|미트)\s*(?:를|을)?\s*(?:바꿨|교체|새로|잃어)|장갑\s*(?:을\s*)?(?:끼고|꼈)|(?<![가-힣])장갑(?![가-힣])/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '장비가 손에 안 익으면 동작이 흐트러진다는 가정',
    },
    ['contact', -1, "'{what}' {who}, 그립이 어색하다고 봤어요"],
    ['control', -1, "'{what}' {who}, 공 쥐는 느낌이 낯설다고 봤어요"],
  ),
  ...person(
    'gear-shoes',
    {
      category: 'gear',
      patterns: [/새\s*(?:신발|스파이크|운동화|야구화)|(?:신발|스파이크|운동화)\s*(?:를|을)?\s*(?:바꿨|교체|새로)|신발\s*(?:을\s*)?신고|(?<![가-힣])신발(?![가-힣])/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '신발이 발에 안 익으면 스텝이 꼬인다는 가정',
    },
    ['speed', -1, "'{what}' {who}, 첫발이 미끄러진다고 봤어요"],
    ['control', -1, "'{what}' {who}, 디딤발이 흔들린다고 봤어요"],
  ),
  ...person(
    'gear-uniform',
    {
      category: 'gear',
      patterns: [/새\s*유니폼|유니폼\s*(?:을\s*)?(?:바꿨|교체|새로|처음)|(?:스페셜|올드|한정판|레트로)\s*유니폼/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '새 옷을 입으면 기분이 산다는 가정',
    },
    ['focus', 1, "'{what}' 입은 {who}, 기분부터 새롭다고 봤어요"],
    ['nerve', 1, "'{what}' 입은 {who}, 어깨가 펴진다고 봤어요"],
  ),
  {
    id: 'gear-helmet',
    category: 'gear',
    patterns: [/새\s*헬멧|헬멧\s*(?:을\s*)?(?:바꿨|교체)|헬멧\s*(?:이\s*)?(?:헐거|안\s*맞|커|작|벗겨|흔들)/],
    knob: 'focus',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' {who}, 시야가 자꾸 흔들린다고 봤어요",
    why: '헬멧이 거슬리면 공에서 눈이 떨어진다는 가정',
  },
  ...person(
    'gear-cap',
    {
      category: 'gear',
      patterns: [/모자\s*(?:가\s*)?(?:자꾸\s*)?(?:벗겨|날아|떨어)|모자\s*챙|모자\s*(?:를\s*)?(?:바꿨|거꾸로|새로)|새\s*모자|(?<![가-힣])모자(?![가-힣])/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '장비가 신경 쓰이면 동작이 흐트러진다는 가정',
    },
    ['focus', -1, "'{what}' {who}, 신경이 모자로 간다고 봤어요"],
    ['control', -1, "'{what}' {who}, 투구 동작이 한 번씩 끊긴다고 봤어요"],
  ),
  ...person(
    'gear-accessory',
    {
      category: 'gear',
      patterns: [/목걸이|팔찌|귀걸이|반지|선글라스|고글|아대|손목\s*밴드/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '마음에 드는 장신구가 기분을 올린다는 가정',
    },
    ['focus', 1, "'{what}' 한 {who}, 멋 부린 만큼 힘이 난다고 봤어요"],
    ['nerve', 1, "'{what}' 한 {who}, 괜히 자신감이 붙는다고 봤어요"],
  ),

  // ---------- 징크스 ----------
  ...person(
    'jinx-underwear',
    {
      category: 'jinx',
      patterns: [/(?:빨간|행운의|같은|럭키)\s*(?:팬티|속옷|양말)|속옷|팬티|(?<![가-힣])양말/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '징크스는 믿는 만큼 통한다는 가정',
    },
    ['focus', 1, "'{what}' 챙긴 {who}, 징크스가 등을 떠민다고 봤어요"],
    ['nerve', 1, "'{what}' 챙긴 {who}, 마음이 든든하다고 봤어요"],
  ),
  ...person(
    'jinx-hair',
    {
      category: 'jinx',
      patterns: [/수염\s*(?:을\s*)?(?:안|못)\s*(?:깎|밀)|면도\s*(?:를\s*)?(?:안|못)\s*(?:했|함|하고)|수염|삭발|머리\s*(?:를\s*)?(?:밀|짧게|잘랐)|염색|탈색|금발|헤어\s*스타일|헤어스타일|파마|가발/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '머리·수염 징크스는 믿는 만큼 통한다는 가정',
    },
    ['focus', 1, "'{what}' {who}, 각오가 남다르다고 봤어요"],
    ['nerve', 1, "'{what}' {who}, 투혼이 공에 실린다고 봤어요"],
  ),
  ...person(
    'jinx-routine',
    {
      category: 'jinx',
      patterns: [/루틴|징크스|습관처럼|의식처럼|같은\s*순서|왼발부터|오른발부터|성호|기도/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '늘 하던 루틴은 마음을 가라앉힌다는 가정',
    },
    ['focus', 1, "'{what}' 지킨 {who}, 평소 리듬 그대로라고 봤어요"],
    ['nerve', 1, "'{what}' 지킨 {who}, 마음이 차분하다고 봤어요"],
  ),
  ...person(
    'jinx-charm',
    {
      category: 'jinx',
      patterns: [/부적|행운의\s*(?:동전|열쇠)|복주머니|소금\s*(?:을\s*)?뿌|액막이/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '부적은 믿는 만큼 통한다는 가정',
    },
    ['focus', 1, "'{what}' 품은 {who}, 기운이 좋다고 봤어요"],
    ['nerve', 1, "'{what}' 품은 {who}, 위기에도 믿는 구석이 있다고 봤어요"],
  ),
  ...person(
    'jinx-song',
    {
      category: 'jinx',
      patterns: [/등장곡|입장곡|등장\s*음악/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'pa',
      why: '등장곡은 타석·마운드 기분을 바꾼다는 가정',
    },
    ['focus', 1, "'{what}'이 흐르면 {who} 흥이 오른다고 봤어요"],
    ['nerve', 1, "'{what}'과 함께 {who} 기분 좋게 올라온다고 봤어요"],
  ),

  // ---------- 가족 ----------
  ...person(
    'family-birth',
    {
      category: 'family',
      patterns: [/출산|득남|득녀|아빠\s*(?:가\s*)?됐|(?:아기|딸|아들|첫째|둘째)\s*(?:가|이)?\s*(?:태어|출생|나왔)|첫\s*(?:아이|아들|딸)|돌잔치|백일\s*잔치|(?<![가-힣])아기(?![가-힣])/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '좋은 소식이 있으면 힘이 난다는 가정',
    },
    ['focus', 1, "'{what}' 소식에 {who} 힘이 솟는다고 봤어요"],
    ['nerve', 1, "'{what}' 소식에 {who} 어깨가 든든하다고 봤어요"],
  ),
  ...person(
    'family-birthday',
    {
      category: 'family',
      patterns: [/생일|생신|환갑|칠순|팔순|결혼\s*(?:\d+\s*)?주년|결혼식|(?<![가-힣])결혼|기념일|축하/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '축하받는 날에는 힘이 난다는 가정',
    },
    ['focus', 1, "'{what}'인 {who}, 스스로에게 선물하고 싶다고 봤어요"],
    ['nerve', 1, "'{what}'인 {who}, 기분 좋게 공을 뿌린다고 봤어요"],
  ),
  ...person(
    'family-letter',
    {
      category: 'family',
      patterns: [/응원\s*(?:편지|문자|메시지|영상|카톡)|손편지|편지\s*(?:를\s*)?(?:받|써|읽)|영상\s*편지|문자\s*(?:를\s*)?받/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '응원 한마디가 힘이 된다는 가정',
      excludes: ['crowd-cheer'],
    },
    ['focus', 1, "'{what}' 받은 {who}, 한 번 더 집중한다고 봤어요"],
    ['nerve', 1, "'{what}' 받은 {who}, 흔들릴 틈이 없다고 봤어요"],
  ),
  ...person(
    'family-visit',
    {
      category: 'family',
      patterns: [/(?:엄마|아빠|어머니|아버지|부모님|가족|아내|와이프|남편|아들|딸|할머니|할아버지|형|누나|동생|삼촌|이모)\s*(?:가|이|께서|들이|랑|도)?\s*(?:직관|응원|경기장|야구장|보러|시구|왔|오셨|오심|옴|방문|관람)|시구|도시락|가족\s*(?:석|나들이)/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '가족 앞에서 힘이 난다는 가정',
      excludes: ['crowd-cheer'],
    },
    ['focus', 1, "'{what}' 앞에서 {who} 더 힘을 낸다고 봤어요"],
    ['nerve', 1, "'{what}' 앞에서 {who} 한 구 한 구 힘을 싣는다고 봤어요"],
  ),
  ...person(
    'family-pet-lost',
    {
      category: 'family',
      patterns: [/(?:강아지|고양이|반려견|반려묘|댕댕이|냥이|햄스터|앵무새)\s*(?:가|이|를|을)?\s*(?:가출|잃어|없어졌|도망|사라졌)/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '걱정거리가 있으면 집중이 흩어진다는 가정',
    },
    ['focus', -1, "'{what}' 걱정에 {who} 집중이 흩어진다고 봤어요"],
    ['nerve', -1, "'{what}' 걱정에 {who} 마음이 콩밭에 있다고 봤어요"],
  ),

  // ---------- 이동·휴식·선발 휴식 ----------
  {
    id: 'travel-long',
    category: 'travel',
    patterns: [/원정길|장거리\s*(?:이동|원정)|버스\s*(?:로|타고)|비행기\s*(?:로|타고|를\s*타)|기차\s*(?:로|타고)|ktx|연착|새벽\s*(?:에\s*)?도착|원정\s*버스|\d+\s*시간\s*(?:동안\s*)?(?:이동|걸려)|(?<![가-힣])(?:버스|비행기|기차|이동)(?![가-힣])/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: -1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'travel_km', defaultValue: 350, unit: 'km' },
    comment: "'{what}' {who}, 먼 길에 다리가 무겁다고 봤어요",
    why: '먼 길을 오면 몸이 무거울 수 있어요',
  },
  {
    id: 'travel-rest',
    category: 'travel',
    patterns: [/푹\s*쉬|휴식일|쉬고\s*(?:온|왔|나온|와서)|(?:하루|이틀|사흘)\s*(?:푹\s*)?쉬|휴식|재충전|off\s*day|day\s*off/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'after_off_day', defaultValue: 1 },
    comment: "'{what}' {who}, 몸이 가벼워졌다고 봤어요",
    why: '푹 쉬고 오면 몸이 가벼울 수 있어요',
  },
  {
    id: 'travel-fatigue',
    category: 'travel',
    patterns: [/연전|강행군|더블헤더|시차|원정\s*(?:피로|강행군)|이동\s*피로/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}'에 {who} 쌓인 피로가 보인다고 봤어요",
    why: '빡빡한 일정은 피로를 쌓는다는 가정',
  },
  {
    id: 'travel-home',
    category: 'travel',
    patterns: [/집에서\s*(?:출퇴근|잤|자고|쉬고|왔)|안방|익숙한\s*구장|홈\s*(?:구장|경기)\s*(?:이라|라서)/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: 1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 제집처럼 편하다고 봤어요",
    why: '익숙한 곳에서는 마음이 편하다는 가정',
  },
  {
    id: 'starter-short-rest',
    category: 'travel',
    patterns: [/(?:선발|로테이션).{0,8}(?:짧게\s*쉬|당겨|덜\s*쉬|나흘\s*쉬)|(?:짧게\s*쉬|당겨서|덜\s*쉬)[가-힣\s]{0,6}(?:선발|등판)/],
    knob: 'stamina',
    defaultSubject: 'pitcher',
    strength: -1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'starter_short_rest', defaultValue: 1 },
    comment: "'{what}' {who}, 어깨가 덜 회복됐다고 봤어요",
    why: '짧게 쉬고 나온 선발은 힘이 떨어질 수 있어요',
  },
  {
    id: 'starter-long-rest',
    category: 'travel',
    patterns: [/(?:선발|로테이션).{0,8}(?:오래\s*쉬|열흘|복귀|오랜만|보름)|(?:오랜만에|오래\s*쉬고|열흘\s*만에)[가-힣\s]{0,6}(?:선발|등판|마운드)|복귀전/],
    knob: 'control',
    defaultSubject: 'pitcher',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'game',
    measured: { variable: 'starter_long_rest', defaultValue: 1 },
    comment: "'{what}' {who}, 실전 감각이 무디다고 봤어요",
    why: '오래 쉬고 나온 선발은 실전 감각이 무딜 수 있어요',
  },

  // ---------- 날씨·환경 ----------
  {
    id: 'weather-rain',
    category: 'weather',
    patterns: [/(?<![가-힣])비\s*(?:가|는|도)?\s*(?:와|옴|온|오|내리|내림|내린|뿌리|왔)|(?<![가-힣])비가|(?<![가-힣])비(?=$|\s|[는도에])|빗방울|빗줄기|빗물|우천|장마|소나기|가랑비|이슬비|보슬비|젖은|젖었|축축|비\s*예보/],
    knob: 'slick',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'rain_pre3h', defaultValue: 3 },
    comment: "'{what}' 공이 젖어 손끝에서 빠진다고 봤어요",
    why: '젖은 공은 채기 어려워 볼이 늘어요',
  },
  {
    id: 'weather-downpour',
    category: 'weather',
    patterns: [/장대비|폭우|호우|물폭탄|억수|(?:비|빗줄기)\s*(?:가\s*)?(?:쏟아|퍼부|퍼붓)|비\s*(?:가\s*)?(?:엄청|많이)\s*(?:와|온|내)/],
    knob: 'slick',
    defaultSubject: 'everyone',
    strength: 2,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'rain_pre3h', defaultValue: 8 },
    comment: "'{what}' 그라운드도 공도 흠뻑 젖는다고 봤어요",
    why: '비가 많이 오면 공이 미끄러워요',
    excludes: ['weather-rain'],
  },
  {
    id: 'weather-humid',
    category: 'weather',
    patterns: [/습도|습해|습한|습하|습기|눅눅|꿉꿉|후텁|끈적|찜통/],
    knob: 'slick',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}' 공 표면이 끈적하게 미끄럽다고 봤어요",
    why: '습하면 손에 땀이 차 공이 미끄러워요',
  },
  {
    id: 'weather-wind',
    category: 'weather',
    patterns: [/바람|강풍|돌풍|태풍|폭풍|칼바람/],
    knob: 'carry',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'wind_ms', defaultValue: 9, unit: 'ms' },
    comment: "'{what}' 타구가 바람을 탄다고 봤어요",
    why: '바람이 세면 타구가 흔들려요',
  },
  {
    id: 'weather-tailwind',
    category: 'weather',
    patterns: [/순풍|뒷바람|바람\s*(?:이\s*)?(?:외야|센터|펜스)\s*(?:쪽\s*)?(?:으로|방향)|외야\s*(?:쪽\s*)?(?:으로\s*)?(?:강한\s*|센\s*)?바람|밀어\s*주는\s*바람/],
    knob: 'carry',
    defaultSubject: 'everyone',
    strength: 2,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}' 뜬공이 담장 쪽으로 밀려간다고 봤어요",
    why: '뒷바람은 타구를 더 멀리 보내요',
    excludes: ['weather-wind'],
  },
  {
    id: 'weather-headwind',
    category: 'weather',
    patterns: [/맞바람|역풍|앞바람|바람\s*(?:이\s*)?(?:홈\s*쪽|안쪽|내야\s*쪽)\s*(?:으로|방향)/],
    knob: 'carry',
    defaultSubject: 'everyone',
    strength: -2,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}'에 큰 타구가 발목을 잡힌다고 봤어요",
    why: '맞바람은 타구 비거리를 줄여요',
    excludes: ['weather-wind'],
  },
  {
    id: 'weather-heat',
    category: 'weather',
    patterns: [/폭염|더위|더워|더운|덥다|덥고|덥네|덥대|무더위|불볕|열대야|푹푹\s*찌|찌는\s*듯/],
    knob: 'carry',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'temp_c', defaultValue: 32, unit: 'celsius' },
    comment: "'{what}' 뜨거운 공기에 타구가 쭉쭉 뻗는다고 봤어요",
    why: '더운 공기는 타구를 더 멀리 보내요',
  },
  {
    id: 'weather-cold',
    category: 'weather',
    patterns: [/추위|추워|추운|춥다|춥고|춥네|쌀쌀|한파|영하|꽁꽁|손\s*(?:이\s*)?(?:시려|곱)|서늘/],
    knob: 'carry',
    defaultSubject: 'everyone',
    strength: -1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'temp_c', defaultValue: 8, unit: 'celsius' },
    comment: "'{what}' 찬 공기에 타구가 뚝 떨어진다고 봤어요",
    why: '찬 공기는 타구 비거리를 줄여요',
  },
  {
    id: 'weather-temp',
    category: 'weather',
    patterns: [/기온|온도|섭씨|°c|(?<![\d.])\d+(?:\.\d+)?\s*c\b/],
    knob: 'carry',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'temp_c', defaultValue: 20, unit: 'celsius' },
    comment: "'{what}' 기온만큼 타구 비거리가 달라진다고 봤어요",
    why: '기온이 오르면 타구가 더 멀리 가요',
    excludes: ['weather-heat', 'weather-cold'],
  },
  {
    id: 'weather-dust',
    category: 'weather',
    patterns: [/미세먼지|초미세|황사|안개|뿌옇|뿌얘|흐릿|스모그/],
    knob: 'glare',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'pa',
    comment: "'{what}'에 공이 흐릿하게 보인다고 봤어요",
    why: '공이 잘 안 보이면 헛스윙이 늘어요',
  },
  {
    id: 'weather-light',
    category: 'weather',
    patterns: [/조명|라이트|불빛|눈부|눈이\s*부시|레이저|플래시|노을|석양|햇빛|햇살|햇볕|역광|그림자|해\s*(?:가\s*)?(?:눈|정면)/],
    knob: 'glare',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'pa',
    comment: "'{what}' 때문에 공이 빛 속으로 사라진다고 봤어요",
    why: '공이 잘 안 보이면 헛스윙이 늘어요',
  },
  {
    id: 'weather-thunder',
    category: 'weather',
    patterns: [/천둥|번개|벼락/],
    knob: 'glare',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 번쩍임에 모두 움찔한다고 봤어요",
    why: '번쩍이는 하늘은 시선을 뺏는다는 가정',
  },
  {
    id: 'weather-day-game',
    category: 'weather',
    patterns: [/낮\s*경기|낮경기|땡볕|대낮|데이\s*게임|day\s*game/],
    knob: 'glare',
    defaultSubject: 'everyone',
    strength: 1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'pa',
    measured: { variable: 'day_game', defaultValue: 1 },
    comment: "'{what}' 햇빛에 뜬공이 사라진다고 봤어요",
    why: '햇빛에 공이 잘 안 보이면 헛스윙이 늘어요',
  },
  {
    id: 'weather-dome',
    category: 'weather',
    patterns: [/돔\s*구장|돔구장|고척\s*돔|실내\s*구장|에어컨/],
    knob: 'slick',
    defaultSubject: 'everyone',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' 뽀송한 공기에 공이 손에 착 붙는다고 봤어요",
    why: '건조하고 시원하면 공이 덜 미끄럽다는 가정',
  },
  {
    id: 'weather-wet-field',
    category: 'weather',
    patterns: [/그라운드\s*(?:가\s*)?(?:젖|질척|미끄|울퉁|엉망)|잔디\s*(?:가\s*)?(?:젖|미끄|길)|흙\s*(?:이\s*)?(?:질척|딱딱)|질척/],
    knob: 'defense',
    defaultSubject: 'fieldingTeam',
    strength: -1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}' {who} 타구가 이상하게 튄다고 봤어요",
    why: '그라운드가 나쁘면 불규칙 바운드가 늘어요',
  },

  // ---------- 응원 ----------
  {
    id: 'crowd-cheer',
    category: 'crowd',
    patterns: [/관중|관객|함성|떼창|응원가|응원\s*(?:소리|열기|석|단)|(?<![가-힣])응원(?![가-힣])|만석|매진|꽉\s*찬|파도타기|치어리더|홈\s*팬|팬들|박수/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: 1,
    negation: 'flip',
    evidence: 'plausible',
    scope: 'game',
    comment: "'{what}' {who}에 힘이 실린다고 봤어요",
    why: '홈 관중의 응원은 홈팀에 힘을 실어줘요',
  },
  ...teamMood(
    'crowd-boo',
    {
      category: 'crowd',
      patterns: [/야유|원성|비난\s*(?:이\s*)?(?:쏟|빗발)/],
      negation: 'cancel',
      evidence: 'plausible',
      scope: 'game',
      why: '쏟아지는 야유는 상대를 흔든다는 가정',
    },
    -1,
    'fieldingTeam',
    ["'{what}' 소리에 {who} 발이 무거워진다고 봤어요", "'{what}' 속에서 {who} 괜히 서두른다고 봤어요", "'{what}' 속에서 {who} 흔들린다고 봤어요"],
  ),
  {
    id: 'crowd-empty',
    category: 'crowd',
    patterns: [/관중\s*(?:이\s*)?(?:없|적|텅|썰렁|별로)|관중석\s*(?:이\s*)?(?:텅|썰렁|비었)|텅\s*(?:빈|비었)|썰렁|무관중|빈\s*자리/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: -1,
    negation: 'cancel',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who} 흥이 안 난다고 봤어요",
    why: '썰렁한 관중석은 기운을 뺀다는 가정',
    excludes: ['crowd-cheer'],
  },
  {
    id: 'crowd-weekend',
    category: 'crowd',
    patterns: [/주말|토요일|일요일|휴일\s*경기|공휴일|weekend/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: 1,
    negation: 'cancel',
    evidence: 'plausible',
    scope: 'game',
    measured: { variable: 'weekend', defaultValue: 1 },
    comment: "'{what}' 북적이는 관중에 {who} 신이 난다고 봤어요",
    why: '주말 경기는 관중과 분위기가 달라요',
  },

  // ---------- 명령 ----------
  {
    id: 'command-homerun',
    category: 'command',
    patterns: [/홈런\s*(?:쳐|치자|치고\s*와|날려|가자|하나|좀|한\s*방)|한\s*방\s*(?:쳐|날려|가자)|담장\s*(?:을\s*)?넘겨|넘겨\s*(?:버려|라)/],
    knob: 'power',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 크게 휘두른다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
  },
  {
    id: 'command-hit',
    category: 'command',
    patterns: [/안타\s*(?:하나(?:만)?\s*)?(?:쳐|치자|가자|좀|부탁)|적시타\s*(?:쳐|가자|하나)|살아\s*나가|출루\s*(?:해|하자|좀)/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 짧게 맞히러 간다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
  },
  {
    id: 'command-walk',
    category: 'command',
    patterns: [/볼넷\s*(?:골라|고르|얻어|가자|좀)|볼\s*(?:잘\s*)?골라|참아|기다려|공\s*(?:잘\s*)?봐/],
    knob: 'eye',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 끝까지 공을 본다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
  },
  {
    id: 'command-steal',
    category: 'command',
    patterns: [/도루\s*(?:해|하자|가자|성공|좀|시도)|뛰어라|달려라|발로\s*(?:흔들|휘저)/],
    knob: 'speed',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 한 베이스 더 노린다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
  },
  {
    id: 'command-strikeout',
    category: 'command',
    patterns: [/삼진\s*(?:잡아|잡자|잡아라|가자|좀|먹여|하나)|탈삼진\s*(?:쇼|가자)|돌려\s*세워/],
    knob: 'stuff',
    defaultSubject: 'pitcher',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 결정구를 꺼낸다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
  },
  {
    id: 'command-control',
    category: 'command',
    patterns: [/제구\s*(?:잡아|좀|잘|해|똑바로)|스트라이크\s*(?:던져|넣어|꽂아)|볼넷\s*(?:주지|내주지)\s*마|코너\s*(?:찔러|꽂아)/],
    knob: 'control',
    defaultSubject: 'pitcher',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 미트만 보고 던진다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
  },
  {
    id: 'command-defense',
    category: 'command',
    patterns: [/수비\s*(?:잘해|잘하자|좀|집중|똑바로|잘\s*하자)|잘\s*잡아|실책\s*(?:하지\s*마|금지|없이)|호수비\s*(?:가자|해|하자)/],
    knob: 'defense',
    defaultSubject: 'fieldingTeam',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 주문에 {who} 글러브를 바짝 낮춘다고 봤어요",
    why: '응원 주문은 믿는 만큼 통한다는 가정',
    excludes: ['slang-leaky-defense'],
  },
  {
    id: 'command-win',
    category: 'command',
    patterns: [/역전|끝내기|이겨라|이기자|이겨|승리|뒤집어|동점|가즈아|파이팅|화이팅|힘내|렛츠고|let'?s\s*go/],
    knob: 'mood',
    defaultSubject: 'battingTeam',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'pa',
    comment: "'{what}' 외침에 {who} 더그아웃이 들썩인다고 봤어요",
    why: '간절한 응원은 믿는 만큼 통한다는 가정',
  },

  // ---------- 은어 ----------
  {
    id: 'slang-wet-bat',
    category: 'slang',
    patterns: [/물방망이|물\s*방망이|방망이\s*(?:가\s*)?물|헛방|빈타/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 공이 방망이를 피해 간다고 봤어요",
    why: '물방망이는 맞히는 힘이 약하다는 말',
  },
  {
    id: 'slang-hot-bat',
    category: 'slang',
    patterns: [/타격감\s*(?:이\s*)?(?:좋|최고|올라|살아|미쳤|절정)|(?:배트|방망이)\s*(?:감|감각)\s*(?:이\s*)?좋|방망이\s*(?:가\s*)?(?:매섭|날카)|정타|컨택\s*(?:좋|굿)/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 공이 방망이 한가운데 맞는다고 봤어요",
    why: '타격감이 좋으면 정타가 늘어난다는 가정',
  },
  {
    id: 'slang-cold-bat',
    category: 'slang',
    patterns: [/타격감\s*(?:이\s*)?(?:죽었|떨어|나쁨|최악|바닥|안\s*좋)|방망이\s*(?:가\s*)?(?:차갑|식었|죽었|안\s*맞)|배트\s*(?:가\s*)?(?:무거|안\s*나와)/],
    knob: 'contact',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 방망이가 한참 늦게 나온다고 봤어요",
    why: '타격감이 떨어지면 빗맞는 공이 늘어난다는 가정',
  },
  {
    id: 'slang-fire-bat',
    category: 'slang',
    patterns: [/불방망이|불\s*방망이|방망이\s*(?:가\s*)?(?:불|뜨거)|대폭발|타선\s*(?:폭발|대폭발)/],
    knob: 'power',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 맞으면 멀리 간다고 봤어요",
    why: '불방망이는 장타가 쏟아진다는 말',
  },
  {
    id: 'slang-long-ball',
    category: 'slang',
    patterns: [/장타\s*(?:감|력)?\s*(?:좋|폭발|쇼)|홈런\s*(?:감|페이스|포스)|거포|펜스\s*(?:직격|넘)|멀리\s*날려/],
    knob: 'power',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 담장이 가깝게 보인다고 봤어요",
    why: '장타 감이 좋으면 큰 타구가 나온다는 가정',
  },
  ...person(
    'slang-on-fire',
    {
      category: 'slang',
      patterns: [/뜨거움|불붙|불타|뜨거운\s*(?:타격|방망이|배트|공|손)|on\s*fire/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '불붙은 선수는 뭘 해도 된다는 가정',
    },
    ['power', 1, "'{what}' {who}, 불붙은 방망이가 멀리 보낸다고 봤어요"],
    ['stuff', 1, "'{what}' {who}, 불붙은 공끝으로 윽박지른다고 봤어요"],
  ),
  ...person(
    'slang-hot-form',
    {
      category: 'slang',
      patterns: [/폼\s*(?:이\s*)?(?:미쳤|좋|최고|올라|절정)|물\s*(?:이\s*)?올랐|긁히는|긁힌|긁혔|날아다|찢었|씹어\s*먹|미쳤다|감\s*(?:이\s*)?(?:좋|올라|잡혔|잡았)/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '물오른 감은 그날 하루 이어진다는 가정',
    },
    ['focus', 1, "'{what}' {who}, 오늘은 뭘 해도 된다고 봤어요"],
    ['stuff', 1, "'{what}' {who}, 공이 손끝에 착착 긁힌다고 봤어요"],
  ),
  {
    id: 'slang-good-eye',
    category: 'slang',
    patterns: [/선구안|눈\s*야구|공\s*(?:을\s*)?잘\s*(?:본|보|골라)|볼\s*(?:을\s*)?잘\s*골라/],
    knob: 'eye',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 유인구에 방망이가 안 나간다고 봤어요",
    why: '공을 잘 고르면 볼넷이 늘어난다는 가정',
  },
  {
    id: 'slang-free-swinger',
    category: 'slang',
    patterns: [/헛스윙|배드\s*볼|나쁜\s*공에\s*(?:손|배트|방망이)|막\s*휘둘|유인구에\s*속/],
    knob: 'eye',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 볼에도 방망이가 나간다고 봤어요",
    why: '나쁜 공에 손이 나가면 삼진이 늘어난다는 가정',
  },
  ...pitcherFirst(
    'slang-glass-mental',
    {
      category: 'slang',
      patterns: [/유리\s*멘탈|새가슴|쫄보|멘탈\s*(?:이\s*)?(?:약|나감|나갔|붕괴|깨|터졌|흔들|가출|털림)/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '멘탈이 약하면 위기에서 흔들린다는 말',
    },
    ['nerve', -1, "'{what}' {who}, 주자만 나가면 손이 떨린다고 봤어요"],
    ['focus', -1, "'{what}' {who}, 큰 무대에서 몸이 굳는다고 봤어요"],
  ),
  ...pitcherFirst(
    'slang-steel-mental',
    {
      category: 'slang',
      patterns: [/강철\s*멘탈|강심장|멘탈\s*(?:이\s*)?(?:갑|최강|강함|튼튼)|포커\s*페이스|배짱|대담|침착/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '강한 멘탈은 위기에서 버틴다는 말',
    },
    ['nerve', 1, "'{what}' {who}, 만루에서도 눈 하나 깜짝 안 한다고 봤어요"],
    ['focus', 1, "'{what}' {who}, 승부처에서 더 차분하다고 봤어요"],
  ),
  {
    id: 'slang-pinpoint',
    category: 'slang',
    patterns: [/칼\s*제구|컨트롤\s*아티스트|제구\s*(?:가\s*|력\s*)?(?:좋|완벽|칼|예술|정교|굿)|핀\s*포인트|구석구석\s*찔러/],
    knob: 'control',
    defaultSubject: 'pitcher',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 미트에 공이 쏙쏙 꽂힌다고 봤어요",
    why: '칼제구는 볼넷이 적다는 말',
  },
  {
    id: 'slang-wild',
    category: 'slang',
    patterns: [/난조|제구\s*(?:가\s*|력\s*)?(?:난조|흔들|안\s*돼|엉망|안\s*잡|불안|말썽)|볼질|폭투\s*(?:남발|연발)|사사구\s*(?:남발|연발)|볼넷\s*(?:남발|연발)|스트라이크\s*(?:를\s*)?못\s*던|영점\s*(?:이\s*)?안\s*잡/],
    knob: 'control',
    defaultSubject: 'pitcher',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 공이 미트를 자꾸 벗어난다고 봤어요",
    why: '난조는 볼이 늘어난다는 말',
  },
  {
    id: 'slang-fireball',
    category: 'slang',
    patterns: [/광속구|강속구|불같은\s*(?:공|직구)|직구\s*(?:가\s*)?(?:좋|빠르|묵직|살아|미쳤)|구속\s*(?:이\s*)?(?:빠르|좋|올라|잘\s*나)|구위\s*(?:가\s*)?(?:좋|최고|살아|묵직|미쳤)|(?<!\d)1[5-6]\d\s*(?:km|킬로)?\s*(?:찍|넘|나옴|나와|던)/],
    knob: 'stuff',
    defaultSubject: 'pitcher',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 공이 미트를 뚫고 나간다고 봤어요",
    why: '빠르고 묵직한 공은 삼진을 부른다는 가정',
  },
  {
    id: 'slang-dead-arm',
    category: 'slang',
    patterns: [/구위\s*(?:가\s*)?(?:죽었|떨어|안\s*좋|밋밋|별로)|공\s*(?:이\s*)?(?:가볍|밋밋|안\s*나가|날리|몰려)|구속\s*(?:이\s*)?(?:안\s*나|떨어|줄었)|배팅\s*볼|맞기\s*좋은/],
    knob: 'stuff',
    defaultSubject: 'pitcher',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 공에 힘이 빠져 맞아 나간다고 봤어요",
    why: '구위가 떨어지면 정타를 맞는다는 말',
  },
  {
    id: 'slang-fast-feet',
    category: 'slang',
    patterns: [/발야구|발\s*(?:이\s*)?빠르|빠른\s*발|주력|대도|준족|번개\s*발|스피드\s*(?:좋|최고|업)/],
    knob: 'speed',
    defaultSubject: 'batter',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 내야 땅볼도 살아 나간다고 봤어요",
    why: '빠른 발은 내야안타를 만든다는 가정',
  },
  {
    id: 'slang-slow-feet',
    category: 'slang',
    patterns: [/발\s*(?:이\s*)?(?:느리|무거|느려)|느림보|굼벵이/],
    knob: 'speed',
    defaultSubject: 'batter',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 1루까지 한참 걸린다고 봤어요",
    why: '발이 느리면 병살이 늘어난다는 가정',
  },
  {
    id: 'slang-iron-defense',
    category: 'slang',
    patterns: [/철벽|호수비|슈퍼\s*캐치|다이빙\s*캐치|수비\s*(?:가\s*)?(?:좋|최고|탄탄|미쳤|안정|굿)|그물\s*수비|수비\s*요정|명품\s*수비/],
    knob: 'defense',
    defaultSubject: 'fieldingTeam',
    strength: 1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 빠질 타구도 걷어낸다고 봤어요",
    why: '탄탄한 수비는 안타를 아웃으로 바꾼다는 가정',
  },
  {
    id: 'slang-leaky-defense',
    category: 'slang',
    patterns: [/구멍\s*수비|수비\s*(?:가\s*)?(?:구멍|엉망|불안|헐거|흔들|최악|별로)|알까기|실책|헛발질|만세\s*(?:수비|했)|낙구|수비\s*연습\s*(?:을\s*)?(?:빼먹|빠졌|거르|안\s*했)/],
    knob: 'defense',
    defaultSubject: 'fieldingTeam',
    strength: -1,
    negation: 'flip',
    evidence: 'fun',
    scope: 'game',
    comment: "'{what}' {who}, 잡을 공도 흘린다고 봤어요",
    why: '흔들리는 수비는 아웃을 안타로 만든다는 가정',
  },
  ...person(
    'slang-slump',
    {
      category: 'slang',
      patterns: [/슬럼프|부진|안\s*풀|꼬였|꼬인다|뇌절|삽질|헤매|죽\s*쑤|폼\s*(?:이\s*)?(?:무너|떨어|나빠|망가)|망했|망함/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '꼬인 날에는 뭘 해도 안 풀린다는 가정',
    },
    ['focus', -1, "'{what}' {who}, 오늘은 뭘 해도 꼬인다고 봤어요"],
    ['nerve', -1, "'{what}' {who}, 한 번 꼬이면 계속 꼬인다고 봤어요"],
  ),

  // ---------- 운 ----------
  ...teamMood(
    'luck-lotto',
    {
      category: 'luck',
      patterns: [/로또|복권|당첨|잭팟|횡재|보너스|용돈|(?<![가-힣])돈(?![가-힣])/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '기분이 좋으면 집중이 잘 된다는 가정',
    },
    1,
    'battingTeam',
    ["'{what}' 소식에 {who} 더그아웃이 들썩인다고 봤어요", "'{what}' 기운 받은 {who}, 오늘 뭐든 된다고 봤어요", "'{what}' 기운 받은 {who}, 공 하나하나가 가볍다고 봤어요"],
  ),
  ...teamMood(
    'luck-good',
    {
      category: 'luck',
      patterns: [/행운|운\s*(?:이\s*)?좋|럭키|길몽|좋은\s*꿈|돼지\s*꿈|용\s*꿈|좋은\s*징조|길조|네잎\s*클로버|네잎클로버|복\s*(?:이\s*)?(?:왔|들어)/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '좋은 징조는 믿는 만큼 통한다는 가정',
    },
    1,
    'battingTeam',
    ["'{what}' {who}에 운이 따른다고 봤어요", "'{what}' {who}, 빗맞아도 안타가 된다고 봤어요", "'{what}' {who}, 잘 맞은 타구도 정면으로 간다고 봤어요"],
  ),
  ...teamMood(
    'luck-bad',
    {
      category: 'luck',
      patterns: [/꽝|불운|재수\s*(?:없|옴|가\s*없)|운\s*(?:이\s*)?(?:나쁘|없|안\s*좋)|악몽|흉몽|나쁜\s*꿈|불길|징조\s*(?:가\s*)?(?:안\s*좋|나쁨|이상)|검은\s*고양이|거울\s*(?:이\s*)?깨|사다리\s*밑|액운/],
      negation: 'flip',
      evidence: 'fun',
      scope: 'game',
      why: '불길한 징조는 믿는 만큼 통한다는 가정',
      excludes: ['luck-lotto', 'luck-good'],
    },
    -1,
    'battingTeam',
    ["'{what}' {who}에 먹구름이 낀다고 봤어요", "'{what}' {who}, 잘 맞은 타구도 정면으로 간다고 봤어요", "'{what}' {who}, 빗맞은 타구가 안타가 된다고 봤어요"],
  ),
  ...teamMood(
    'luck-money',
    {
      category: 'luck',
      patterns: [/연봉\s*(?:대박|인상|올랐)|(?:fa|다년)\s*(?:대박|계약)|계약\s*(?:대박|성공|했|체결)|대박\s*계약|새\s*차|차\s*(?:를\s*)?뽑|집\s*(?:을\s*)?샀|이사\s*(?:했|함|갔)|선물/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '좋은 일이 생기면 어깨가 가볍다는 가정',
    },
    1,
    'battingTeam',
    ["'{what}' 소식에 {who} 분위기가 산다고 봤어요", "'{what}' {who}, 어깨가 가벼워졌다고 봤어요", "'{what}' {who}, 마음 편하게 던진다고 봤어요"],
  ),
  ...teamMood(
    'luck-praise',
    {
      category: 'luck',
      patterns: [/칭찬|극찬|호평|mvp|수훈\s*선수|티어\s*(?:올|승급)|승급|팔로워\s*(?:늘|폭증|급증)|인터뷰\s*(?:잘|대박)|박수\s*받/],
      negation: 'cancel',
      evidence: 'fun',
      scope: 'game',
      why: '칭찬을 들으면 신이 난다는 가정',
    },
    1,
    'battingTeam',
    ["'{what}'에 {who} 기세가 오른다고 봤어요", "'{what}' 들은 {who}, 신이 나서 방망이가 돈다고 봤어요", "'{what}' 들은 {who}, 기분 좋게 공을 뿌린다고 봤어요"],
  ),
];

/** 핵심 개념 + 일상 낱말 DB(lexiconDb.ts). 매칭은 이 순서대로 본다 */
export const CONCEPTS: readonly Concept[] = [...CORE_CONCEPTS, ...DB_CONCEPTS];

// ---------- 매칭 ----------

/** 매칭 바로 앞의 부정 부사: "안 떨림", "전혀 피곤", "하나도 안" */
const PRE_NEGATION = /(?:^|\s)(?:안|못|전혀|절대|별로|하나도|결코)\s*$/;
/** 매칭 뒤의 부정 부사: "짜장면 안 먹었다", "늦잠 안 잤다" */
const POST_ADVERB = /^[을를은는이가도]?\s+(?:안|못)(?:\s|$)/;
/** 매칭 뒤의 부정 어미: "피곤하지 않다", "피곤한 게 아니다", "바람 한 점 없음" */
const POST_SUFFIX = /^[가-힣]{0,3}\s?(?:지\s*(?:않|못|마|는\s*않)|(?:게|건|거)?\s?(?:아니|아냐|아님)|없)|^\s*(?:한\s*점|하나)?\s*없/;
const WINDOW = 6;

/** text의 [start, end) 표현 앞뒤 6글자 안에 부정어가 붙었는지. 표현 안의 부정("못 잤다")은 세지 않는다 */
function negatedAt(text: string, start: number, end: number): boolean {
  if (start >= text.length) return false;
  const before = text.slice(Math.max(0, start - WINDOW), start);
  const after = text.slice(end, end + WINDOW);
  return PRE_NEGATION.test(before) || POST_ADVERB.test(after) || POST_SUFFIX.test(after);
}

function withTokens(text: string): string {
  const tokens = tokensOf(text);
  return tokens.length > 0 ? `${text} ${tokens.join(' ')}` : text;
}

interface Found {
  index: number;
  order: number;
  match: ConceptMatch;
}

export function matchConcepts(clause: Clause, prepared: PreparedText): ConceptMatch[] {
  const text = clause.text;
  const scan = withTokens(text);
  const found: Found[] = [];
  CONCEPTS.forEach((concept, order) => {
    let best: { index: number; matched: string } | null = null;
    for (const re of concept.patterns) {
      const m = re.exec(scan);
      if (m && (!best || m.index < best.index || (m.index === best.index && m[0].length > best.matched.length))) {
        best = { index: m.index, matched: m[0] };
      }
    }
    const q = concept.quantity;
    if (!best && q && q.near.test(scan)) {
      const number = prepared.numbers.find((n) => n.unit === q.unit
        && (q.min === undefined || n.value >= q.min)
        && (q.max === undefined || n.value <= q.max)
        && text.includes(n.raw));
      if (number) best = { index: text.indexOf(number.raw), matched: number.raw };
    }
    if (!best) return;
    const negated = negatedAt(text, best.index, best.index + best.matched.length);
    found.push({ index: best.index, order, match: { concept, matched: best.matched.trim(), negated } });
  });
  const excluded = new Set(found.flatMap((f) => f.match.concept.excludes ?? []));
  return found
    .filter((f) => !excluded.has(f.match.concept.id) && !(f.match.concept.group !== undefined && excluded.has(f.match.concept.group)))
    .sort((a, b) => a.index - b.index || a.order - b.order)
    .map((f) => f.match);
}

// ---------- 분위기 ----------

const POSITIVE = /좋|최고|굿|짱|대박|행복|기쁨|기쁘|기뻐|신나|신남|설레|자신감|파이팅|화이팅|힘내|이겨|이긴|승리|웃음|웃었|멋지|멋있|사랑|감사|축하|성공|완벽|럭키|행운|꿀잼|이득|쩐다|대단|훌륭|굉장|든든|상쾌|개운|최상|잘했|잘한|잘해|잘\s*됐/g;
const NEGATIVE = /나쁘|나쁨|나빠|최악|별로|싫|짜증|화나|화남|열받|빡|슬프|슬픔|슬퍼|우울|망했|망함|망해|꽝|실패|패배|졌다|불안|걱정|무섭|무서|두렵|피곤|힘들|아쉽|아쉬|답답|속상|한숨|에휴|엉망|구려|찝찝|괴롭|지쳤|절망/g;

/** 문장 분위기: 긍정 1, 부정 −1, 모름 0 (대체 해석용). 부정어가 붙은 긍정 표현은 부정으로 센다 */
export function sentimentOf(text: string): -1 | 0 | 1 {
  const scan = withTokens(text.trim().toLowerCase());
  let score = 0;
  for (const m of scan.matchAll(POSITIVE)) {
    const start = m.index ?? 0;
    score += negatedAt(scan, start, start + m[0].length) ? -1 : 1;
  }
  for (const m of scan.matchAll(NEGATIVE)) {
    const start = m.index ?? 0;
    score += negatedAt(scan, start, start + m[0].length) ? 1 : -1;
  }
  return score > 0 ? 1 : score < 0 ? -1 : 0;
}
