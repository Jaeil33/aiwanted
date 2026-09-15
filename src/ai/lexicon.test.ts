import { describe, expect, it } from 'vitest';
import { KNOB_IDS, KNOB_META, SUBJECTS_FOR } from '../domain/knobs';
import { MEASURED } from '../domain/measured';
import { CONCEPTS, matchConcepts, sentimentOf } from './lexicon';
import type { ConceptMatch } from './lexicon';
import { prepareText } from './text';

/* 개념 사전 테스트. 가상 이름(김타자·박투수)과 역할어만 쓴다. */

const matchAll = (text: string): ConceptMatch[] => {
  const prepared = prepareText(text);
  return prepared.clauses.flatMap((clause) => matchConcepts(clause, prepared));
};
const ids = (text: string) => matchAll(text).map((m) => m.concept.id);
const find = (text: string, id: string) => matchAll(text).find((m) => m.concept.id === id);
const concept = (id: string) => {
  const c = CONCEPTS.find((x) => x.id === id);
  if (!c) throw new Error(`개념 없음: ${id}`);
  return c;
};

describe('사전 구조', () => {
  it('손잡이 14개 모두 개념 3개 이상, 전체 70개 이상', () => {
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(70);
    for (const knob of KNOB_IDS) {
      expect(CONCEPTS.filter((c) => c.knob === knob).length, knob).toBeGreaterThanOrEqual(3);
    }
  });

  it('id는 겹치지 않고 필드 값이 계약 안에 있다', () => {
    const CATEGORIES = ['food', 'sleep', 'mood', 'gear', 'jinx', 'family', 'travel', 'weather', 'crowd', 'command', 'slang', 'body', 'luck'];
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
    for (const c of CONCEPTS) {
      expect(CATEGORIES, c.id).toContain(c.category);
      expect([1, 2, -1, -2], c.id).toContain(c.strength);
      expect(['flip', 'cancel'], c.id).toContain(c.negation);
      expect(['plausible', 'fun'], c.id).toContain(c.evidence);
      expect(['pa', 'game'], c.id).toContain(c.scope);
      expect(c.patterns.length, c.id).toBeGreaterThan(0);
      for (const re of c.patterns) expect(re.global || re.sticky, `${c.id} ${re}`).toBe(false);
      expect(c.comment, c.id).toContain('{what}');
      expect(Array.from(c.why).length, c.id).toBeLessThanOrEqual(60);
      expect(c.why.length, c.id).toBeGreaterThan(0);
    }
  });

  it('모든 기본 대상은 손잡이의 SUBJECTS_FOR 안에 있다', () => {
    for (const c of CONCEPTS) expect(SUBJECTS_FOR[KNOB_META[c.knob].who], c.id).toContain(c.defaultSubject);
  });

  it('실측 변수는 measured.json에서 applicable인 id만 쓴다', () => {
    const applicable = MEASURED.filter((def) => def.applicable).map((def) => def.id);
    const withMeasured = CONCEPTS.filter((c) => c.measured);
    expect(withMeasured.length).toBeGreaterThanOrEqual(7);
    for (const c of withMeasured) {
      expect(applicable, c.id).toContain(c.measured!.variable);
      expect(Number.isFinite(c.measured!.defaultValue), c.id).toBe(true);
    }
    expect(new Set(withMeasured.map((c) => c.measured!.variable))).toEqual(new Set(applicable));
  });

  it('같은 group은 대상별로 다른 손잡이를 고르는 변형이고, excludes는 있는 id만 가리킨다', () => {
    const known = new Set(CONCEPTS.map((c) => c.id));
    const groups = new Map<string, string[]>();
    for (const c of CONCEPTS) {
      for (const id of c.excludes ?? []) expect(known.has(id), `${c.id} → ${id}`).toBe(true);
      if (c.group) groups.set(c.group, [...(groups.get(c.group) ?? []), c.knob]);
    }
    expect(groups.size).toBeGreaterThan(10);
    for (const [group, knobs] of groups) expect(new Set(knobs).size, group).toBe(knobs.length);
  });

  it('민감 주제는 개념이 아니다', () => {
    for (const word of ['소주', '맥주', '음주', '숙취', '감기 몸살', '부상', '인대', '골절', '사망', '이혼', '여자친구', '도박', '마약', '우울증', '병원', '수술', '아프다', '열이 39도']) {
      expect(ids(word), word).toEqual([]);
    }
  });
});

describe('대표 문장', () => {
  const CASES: Array<[text: string, id: string]> = [
    ['박투수가 경기 전 짜장면 곱빼기를 먹었다', 'food-heavy'],
    ['타자 치킨 두 마리 먹음', 'food-heavy'],
    ['타자 신라면 먹음', 'food-heavy'],
    ['투수가 삼겹살 2인분', 'food-heavy'],
    ['투수가 마라탕 먹고 옴', 'food-spicy'],
    ['타자가 장어 먹고 힘이 넘친다', 'food-hearty'],
    ['투수 국밥 한 그릇 뚝딱', 'food-hearty'],
    ['투수 경기 전 커피 세 잔', 'food-caffeine'],
    ['투수가 에너지드링크 원샷', 'food-caffeine'],
    ['투수 커피 5잔 마심', 'food-caffeine-overdose'],
    ['타자가 굶고 나왔다', 'food-hungry'],
    ['타자가 바나나 두 개 먹었다', 'food-sweet'],
    ['투수가 어젯밤 3시간밖에 못 잤다', 'sleep-short'],
    ['투수 3시간 잤다', 'sleep-short'],
    ['투수가 밤샘 게임했다', 'sleep-short'],
    ['타자 잠 설침', 'sleep-short'],
    ['투수 꿀잠 잠', 'sleep-good'],
    ['타자가 12시간 잤다', 'sleep-good'],
    ['타자 낮잠 한숨 잤다', 'sleep-nap'],
    ['투수가 늦잠 자서 지각', 'sleep-oversleep'],
    ['타자 졸림', 'body-tired'],
    ['batter is super tired', 'body-tired'],
    ['에이스가 오늘 좀 떨린대', 'mood-nervous'],
    ['투수 긴장한 표정', 'mood-nervous'],
    ['투수 개빡침', 'mood-angry'],
    ['투수 킹받음', 'mood-angry'],
    ['타자 설렘 가득', 'mood-excited'],
    ['타자 자신감 넘침', 'mood-confident'],
    ['타자 기분 최고', 'mood-happy'],
    ['투수 눈물 글썽', 'mood-sad'],
    ['투수가 악플을 봤다', 'mood-hate'],
    ['타자 new bat', 'gear-new-bat'],
    ['타자 배트 부러짐', 'gear-broken-bat'],
    ['투수 글러브 바꿨다', 'gear-glove'],
    ['투수 새 스파이크', 'gear-shoes'],
    ['타자 새 유니폼 처음 입음', 'gear-uniform'],
    ['타자 헬멧이 헐거움', 'gear-helmet'],
    ['박투수 모자가 자꾸 벗겨진다', 'gear-cap'],
    ['타자 목걸이 새로 함', 'gear-accessory'],
    ['타자가 빨간 팬티 입음', 'jinx-underwear'],
    ['투수가 수염 안 깎음', 'jinx-hair'],
    ['투수 삭발 투혼', 'jinx-hair'],
    ['타자 루틴 그대로', 'jinx-routine'],
    ['투수 부적 챙김', 'jinx-charm'],
    ['투수 등장곡 바꿈', 'jinx-song'],
    ['타자 딸이 태어났다', 'family-birth'],
    ['박투수 오늘 생일이다', 'family-birthday'],
    ['김타자 결혼 1주년', 'family-birthday'],
    ['엄마가 김타자에게 응원 편지를 보냈다', 'family-letter'],
    ['투수 할머니가 응원 오심', 'family-visit'],
    ['타자네 고양이가 가출했다', 'family-pet-lost'],
    ['원정팀이 버스로 5시간 이동했다', 'travel-long'],
    ['KT 비행기 연착으로 새벽 도착', 'travel-long'],
    ['홈팀 선수들 집에서 푹 쉬고 왔다', 'travel-rest'],
    ['원정 9연전 마지막 날', 'travel-fatigue'],
    ['선발이 짧게 쉬고 나왔다', 'starter-short-rest'],
    ['선발이 열흘 만에 복귀했다', 'starter-long-rest'],
    ['비가 온다', 'weather-rain'],
    ["it's raining", 'weather-rain'],
    ['🌧️', 'weather-rain'],
    ['빗줄기가 굵어졌다', 'weather-rain'],
    ['장대비가 쏟아진다', 'weather-downpour'],
    ['습도 90%', 'weather-humid'],
    ['바람이 엄청 분다', 'weather-wind'],
    ['외야 쪽으로 강한 바람', 'weather-tailwind'],
    ['맞바람 분다', 'weather-headwind'],
    ['폭염 경보 떴다', 'weather-heat'],
    ['오늘 진짜 덥다', 'weather-heat'],
    ['추위 장난 아님', 'weather-cold'],
    ['🥶', 'weather-cold'],
    ['기온 12도', 'weather-temp'],
    ['미세먼지 최악', 'weather-dust'],
    ['조명탑 불빛이 눈부시다', 'weather-light'],
    ['노을이 타자 눈에 딱 들어온다', 'weather-light'],
    ['천둥 번개 친다', 'weather-thunder'],
    ['낮 경기라 땡볕이다', 'weather-day-game'],
    ['돔구장이라 에어컨 빵빵', 'weather-dome'],
    ['그라운드가 질척하다', 'weather-wet-field'],
    ['관중 2만 명이 떼창 중', 'crowd-cheer'],
    ['Home crowd so loud', 'crowd-cheer'],
    ['관중들 야유 쏟아진다', 'crowd-boo'],
    ['관중석이 텅 비었다', 'crowd-empty'],
    ['일요일 경기', 'crowd-weekend'],
    ['홈런 쳐라', 'command-homerun'],
    ['안타 하나만 쳐줘', 'command-hit'],
    ['볼넷 골라', 'command-walk'],
    ['도루해', 'command-steal'],
    ['삼진 잡아', 'command-strikeout'],
    ['제구 잡아라', 'command-control'],
    ['수비 잘해', 'command-defense'],
    ['역전해!', 'command-win'],
    ['끝내기 가자', 'command-win'],
    ['타자 완전 물방망이', 'slang-wet-bat'],
    ['불방망이 폭발', 'slang-fire-bat'],
    ['투수 유리멘탈', 'slang-glass-mental'],
    ['새가슴 투수', 'slang-glass-mental'],
    ['강철멘탈 마무리', 'slang-steel-mental'],
    ['오늘 칼제구', 'slang-pinpoint'],
    ['투수 난조', 'slang-wild'],
    ['광속구 뿌림', 'slang-fireball'],
    ['발야구 시작', 'slang-fast-feet'],
    ['철벽 수비', 'slang-iron-defense'],
    ['유격수가 오늘 실책 2개 했다', 'slang-leaky-defense'],
    ['투수 뇌절 중', 'slang-slump'],
    ['타자 폼 미쳤다', 'slang-hot-form'],
    ['투수 오늘 긁히는 날', 'slang-hot-form'],
    ['🔥🔥🔥', 'slang-on-fire'],
    ['투수 컨디션 bad', 'body-heavy'],
    ['김타자 오늘 컨디션 최고래', 'body-good'],
    ['땀 범벅', 'body-sweat'],
    ['타자 딸꾹질 시작', 'body-distracted'],
    ['투수 투구수 이미 110개', 'body-pitch-count'],
    ['김타자 최근 10경기 타율 4할', 'body-hot-streak'],
    ['타자 로또 5등 됐다', 'luck-lotto'],
    ['타자 로또 꽝', 'luck-bad'],
    ['타자 연봉 대박 계약', 'luck-money'],
    ['해설위원이 김타자 칭찬함', 'luck-praise'],
    ['행운의 네잎클로버', 'luck-good'],
    ['😴', 'body-tired'],
    ['🍜🍜', 'food-heavy'],
    ['pitcher drank 3 coffees', 'food-caffeine'],
  ];

  it('60개 이상', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASES)('%s → %s', (text, id) => {
    expect(ids(text)).toContain(id);
  });
});

describe('매칭 규칙', () => {
  it('서로 다른 개념은 매칭 위치 순서로 여러 개, 같은 개념은 한 번만', () => {
    const prepared = prepareText('폭염에 관중 만석, 투수는 긴장');
    expect(matchConcepts(prepared.clauses[0], prepared).map((m) => m.concept.id)).toEqual(['weather-heat', 'crowd-cheer']);
    expect(ids('비 온다 또 비 온다 비').filter((id) => id === 'weather-rain')).toHaveLength(1);
    expect(find('박투수가 짜장면 곱빼기를 먹었다', 'food-heavy')?.matched).toBe('짜장면');
  });

  it('더 구체적인 개념이 넓은 개념을 뺀다', () => {
    expect(ids('투수 커피 5잔 마심')).not.toContain('food-caffeine');
    expect(ids('타자 로또 꽝')).not.toContain('luck-lotto');
    expect(ids('외야 쪽으로 강한 바람')).not.toContain('weather-wind');
    expect(ids('장대비가 쏟아진다')).not.toContain('weather-rain');
    expect(ids('관중석이 텅 비었다')).not.toContain('crowd-cheer');
    expect(ids('엄마가 김타자에게 응원 편지를 보냈다')).not.toContain('crowd-cheer');
    expect(ids('기온 35도, 폭염')).toEqual(expect.arrayContaining(['weather-temp']));
  });

  it('투수·타자 변형은 같은 group으로 함께 나온다', () => {
    const found = matchAll('짜장면 곱빼기');
    expect(found.map((m) => m.concept.id)).toEqual(expect.arrayContaining(['food-heavy', 'food-heavy-p']));
    expect(concept('food-heavy')).toMatchObject({ knob: 'focus', defaultSubject: 'batter', group: 'food-heavy' });
    expect(concept('food-heavy-p')).toMatchObject({ knob: 'stamina', defaultSubject: 'pitcher', group: 'food-heavy' });
  });

  it('부정어(안·못·않·없·전혀·아니)가 앞뒤 6글자 안에 있으면 negated', () => {
    for (const [text, id] of [
      ['투수가 전혀 피곤하지 않다', 'body-tired'],
      ['짜장면 안 먹었다', 'food-heavy'],
      ['타자 하나도 안 떨림', 'mood-nervous'],
      ['오늘 비 안 온다', 'weather-rain'],
      ['투수가 늦잠 안 잤다', 'sleep-oversleep'],
      ['바람 한 점 없음', 'weather-wind'],
    ] as const) {
      const match = find(text, id);
      expect(match, text).toMatchObject({ negated: true });
      expect(match?.concept.negation, text).toBe('flip');
    }
    for (const [text, id] of [
      ['타자 새 배트 안 씀', 'gear-new-bat'],
      ['커피 안 마셨다', 'food-caffeine'],
    ] as const) {
      expect(find(text, id), text).toMatchObject({ negated: true, concept: { negation: 'cancel' } });
    }
  });

  it('개념 자체에 부정이 들어간 표현과 다른 서술어의 부정은 세지 않는다', () => {
    expect(find('어젯밤 잠을 못 잤다', 'sleep-short')).toMatchObject({ negated: false });
    expect(find('컨디션 안 좋다', 'body-heavy')).toMatchObject({ negated: false });
    expect(find('타자 로또 꽝', 'luck-bad')).toMatchObject({ negated: false });
    expect(find('투수가 수염 안 깎음', 'jinx-hair')).toMatchObject({ negated: false });
    expect(find('잠을 못 자서 피곤', 'body-tired')).toMatchObject({ negated: false });
    expect(find('안타 치고 피곤', 'body-tired')).toMatchObject({ negated: false });
    expect(find('투수가 오늘 불안한 표정', 'mood-nervous')).toMatchObject({ negated: false });
  });

  it('은어 방향', () => {
    const sign = (id: string) => [concept(id).knob, Math.sign(concept(id).strength)];
    expect(sign('slang-wet-bat')).toEqual(['contact', -1]);
    expect(sign('slang-fire-bat')).toEqual(['power', 1]);
    expect(sign('slang-glass-mental')).toEqual(['nerve', -1]);
    expect(sign('slang-steel-mental')).toEqual(['nerve', 1]);
    expect(sign('slang-pinpoint')).toEqual(['control', 1]);
    expect(sign('slang-wild')).toEqual(['control', -1]);
    expect(sign('slang-fireball')).toEqual(['stuff', 1]);
    expect(sign('slang-fast-feet')).toEqual(['speed', 1]);
    expect(sign('slang-iron-defense')).toEqual(['defense', 1]);
    expect(sign('command-homerun')).toEqual(['power', 1]);
    expect(sign('command-strikeout')).toEqual(['stuff', 1]);
    expect(sign('command-defense')).toEqual(['defense', 1]);
  });

  it('날씨·일정 개념은 실측 변수와 기본값을 가진다', () => {
    expect(concept('weather-rain').measured).toMatchObject({ variable: 'rain_pre3h' });
    expect(concept('weather-wind').measured).toMatchObject({ variable: 'wind_ms', unit: 'ms' });
    expect(concept('weather-heat').measured).toMatchObject({ variable: 'temp_c', unit: 'celsius' });
    expect(concept('travel-long').measured).toMatchObject({ variable: 'travel_km', unit: 'km' });
    expect(concept('travel-rest').measured).toMatchObject({ variable: 'after_off_day', defaultValue: 1 });
    expect(concept('weather-day-game').measured).toMatchObject({ variable: 'day_game', defaultValue: 1 });
    expect(concept('crowd-weekend').measured).toMatchObject({ variable: 'weekend', defaultValue: 1 });
  });

  it('숫자 구간으로 잠·카페인 개념을 가린다', () => {
    expect(ids('투수 커피 2잔')).toContain('food-caffeine');
    expect(ids('투수 네 시간 잤다')).toContain('sleep-short');
    expect(ids('타자 slept 9 hours')).toContain('sleep-good');
    expect(ids('타자 6시간 잤다')).not.toEqual(expect.arrayContaining(['sleep-short']));
  });

  it('결정적이다', () => {
    const text = '투수는 짜장면 먹고 타자는 잠 못 잤다, 폭염';
    expect(matchAll(text)).toEqual(matchAll(text));
  });
});

describe('sentimentOf', () => {
  it.each([
    ['오늘 기분 최고', 1],
    ['완전 대박 좋아', 1],
    ['good day', 1],
    ['👍', 1],
    ['완전 최악이다', -1],
    ['기분 안 좋아', -1],
    ['망했다 ㅠㅠ', -1],
    ['😭', -1],
    ['외계인이 우주선에서 경기를 본다', 0],
    ['', 0],
  ] as const)('%s → %i', (text, expected) => {
    expect(sentimentOf(text)).toBe(expected);
  });
});
