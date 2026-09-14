// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { intensityOf, prepareText, tokensOf } from './text';
import type { NumberUnit } from './text';

/* 입력 정리 테스트. 가상 이름(김타자·박투수)만 쓴다. */

const texts = (input: string) => prepareText(input).clauses.map((c) => c.text);
const hints = (input: string) => prepareText(input).clauses.map((c) => c.subjectHint);

describe('prepareText 정규화', () => {
  it('원문은 그대로 두고, 보이지 않는 문자를 지우고 전각은 반각, 유니코드 마이너스는 -, 라틴 문자는 소문자, 공백은 하나로', () => {
    const input = '  ＫＴ​ 투수가\t\n영하 −３도에   COFFEE?! ';
    const p = prepareText(input);
    expect(p.original).toBe(input);
    expect(p.normalized).toBe('kt 투수가 영하 -3도에 coffee?!');
  });

  it('같은 글자 3번 이상은 2번으로 줄인다(숫자는 줄이지 않는다)', () => {
    expect(prepareText('ㅋㅋㅋㅋㅋ 짜장면!!!!!! 🔥🔥🔥 투구수 1000개').normalized).toBe('ㅋㅋ 짜장면!! 🔥🔥 투구수 1000개');
  });

  it('대소문자와 기호: 라틴 문자는 소문자, ℃·㎧는 °c·m/s', () => {
    expect(prepareText('Home Crowd SO LOUD').normalized).toBe('home crowd so loud');
    expect(prepareText('35℃, 5㎧').normalized).toBe('35°c, 5m/s');
  });

  it('호환용 자모(초성)는 그대로 두고, 풀어 쓴 한글은 모은다', () => {
    expect(prepareText('ㅈㄴ　ＰＩＴＣＨＥＲ').normalized).toBe('ㅈㄴ pitcher');
    expect(prepareText('피곤').normalized).toBe('피곤');
  });

  it('한 글자씩 띄워 쓴 문장은 붙인다', () => {
    expect(prepareText('투 수 가  피 곤 해').normalized).toBe('투수가피곤해');
    expect(prepareText('잠 못 잠').normalized).toBe('잠 못 잠');
  });

  it('같은 입력은 같은 결과다', () => {
    const input = '박투수는 커피 3잔 마시고 김타자는 ㅈㄴ 피곤 🌧️';
    expect(prepareText(input)).toEqual(prepareText(input));
  });
});

describe('강도', () => {
  it.each([
    ['투수 피곤', 0],
    ['개가 짖는다', 0],
    ['공 3개 던짐', 0],
    ['개막전 핵심 타자', 0],
    ['좀비 영화', 0],
    ['타자 살짝 피곤', 1],
    ['투수 조금 피곤', 1],
    ['투수 약간 배부름', 1],
    ['에이스가 오늘 좀 떨린대', 1],
    ['타자 완전 피곤', 2],
    ['투수 개피곤', 2],
    ['ㅈㄴ 피곤', 2],
    ['존나 졸림', 2],
    ['핵피곤', 2],
    ['타자 미친듯이 긴장', 2],
    ['넘 피곤', 2],
    ['batter is super tired', 2],
    ['살짝 개피곤', 2],
  ] as const)('%s → %i', (input, level) => {
    expect(prepareText(input).intensity).toBe(level);
  });

  it('intensityOf는 절 하나에도 쓸 수 있다', () => {
    expect(intensityOf('투수 살짝 긴장')).toBe(1);
    expect(intensityOf('타자 개피곤')).toBe(2);
    expect(intensityOf('비 옴')).toBe(0);
  });
});

describe('토큰', () => {
  it('영어 단어 → 대표 한국어 개념어', () => {
    expect(prepareText('pitcher drank 3 coffees').tokens).toEqual(expect.arrayContaining(['투수', '커피']));
    expect(prepareText("it's raining").tokens).toEqual(['비']);
    expect(prepareText('batter is super tired').tokens).toEqual(['타자', '피곤']);
    expect(prepareText('Hot day').tokens).toEqual(['더위']);
    expect(prepareText('so cold').tokens).toEqual(['추위']);
    expect(prepareText('sleepy').tokens).toEqual(['피곤']);
    expect(prepareText('slept well').tokens).toContain('잠');
    expect(prepareText('beer').tokens).toEqual(['맥주']);
    expect(prepareText('ramen').tokens).toEqual(['라면']);
    expect(prepareText('타자 new bat').tokens).toEqual(['새', '배트']);
    expect(prepareText('Home crowd so loud').tokens).toEqual(['홈', '관중', '함성']);
    expect(prepareText('batteries restaurant').tokens).toEqual([]);
  });

  it('이모지 → 개념어 (같은 토큰은 한 번만)', () => {
    expect(prepareText('🌧️').tokens).toEqual(['비']);
    expect(prepareText('☔').tokens).toEqual(['비']);
    expect(prepareText('🔥🔥🔥').tokens).toEqual(['뜨거움']);
    expect(prepareText('😴').tokens).toEqual(['졸림']);
    expect(prepareText('🍜🍜').tokens).toEqual(['라면']);
    expect(prepareText('🍺').tokens).toEqual(['맥주']);
    expect(prepareText('🍗').tokens).toEqual(['치킨']);
    expect(prepareText('⚾').tokens).toEqual(['야구']);
    expect(prepareText('🥶').tokens).toEqual(['추위']);
  });

  it('초성은 낱말로 바꾸고 토큰에 더한다(강도 표시 ㅈㄴ은 그대로)', () => {
    const p = prepareText('ㅌㅅ ㅍㄱ');
    expect(p.normalized).toBe('투수 피곤');
    expect(p.tokens).toEqual(['투수', '피곤']);
    expect(prepareText('ㅋㅋㅋ').tokens).toEqual(['웃음']);
    expect(prepareText('ㅠㅠ').tokens).toEqual(['슬픔']);
    expect(prepareText('ㅈㄴ 피곤').tokens).toEqual([]);
  });

  it('오타·구어는 바로잡고 토큰에 더한다', () => {
    const food = prepareText('짜장면 머거따');
    expect(food.normalized).toBe('짜장면 먹었다');
    expect(food.tokens).toContain('먹었다');
    expect(prepareText('짜장면 곱배기 먹엇음')).toMatchObject({ normalized: '짜장면 곱빼기 먹었음', tokens: expect.arrayContaining(['곱빼기', '먹었음']) });
    expect(prepareText('잠못잠')).toMatchObject({ normalized: '잠 못 잠', tokens: ['잠'] });
    expect(prepareText('투수 잠을못잤다').normalized).toBe('투수 잠을 못 잤다');
    expect(prepareText('타자 안떨림').normalized).toBe('타자 안 떨림');
    expect(prepareText('안타 치고 안경 씀').normalized).toBe('안타 치고 안경 씀');
    expect(prepareText('넘 피곤').normalized).toBe('너무 피곤');
    expect(prepareText('구속 150 넘게').normalized).toBe('구속 150 넘게');
    expect(prepareText('피곤쓰')).toMatchObject({ normalized: '피곤', tokens: ['피곤'] });
  });

  it('tokensOf는 정리된 절 문장의 영어·이모지·초성 토큰을 순서대로 준다', () => {
    expect(tokensOf('pitcher 피곤 🌧')).toEqual(['투수', '비']);
    expect(tokensOf('짜장면 먹었다')).toEqual([]);
  });
});

describe('숫자와 단위', () => {
  const CASES: Array<[input: string, value: number, unit: NumberUnit | null, raw: string]> = [
    ['투수가 3시간 잤다', 3, 'hour', '3시간'],
    ['타자 12시간 잤다', 12, 'hour', '12시간'],
    ['2시간 반 이동', 2.5, 'hour', '2시간 반'],
    ['slept 3 hours', 3, 'hour', '3 hours'],
    ['30분 늦게 도착', 30, 'minute', '30분'],
    ['커피 5잔', 5, 'cup', '5잔'],
    ['커피 세 잔', 3, 'cup', '세 잔'],
    ['pitcher drank 3 coffees', 3, 'cup', '3 coffees'],
    ['음료 2병', 2, 'bottle', '2병'],
    ['국밥 한 그릇', 1, 'bowl', '한 그릇'],
    ['삼겹살 2인분', 2, 'bowl', '2인분'],
    ['기온 35도', 35, 'celsius', '35도'],
    ['35°C 폭염', 35, 'celsius', '35°c'],
    ['hot day 35C', 35, 'celsius', '35c'],
    ['영하 3도', -3, 'celsius', '영하 3도'],
    ['섭씨 35', 35, 'celsius', '섭씨 35'],
    ['버스로 400km', 400, 'km', '400km'],
    ['바람 5m/s', 5, 'ms', '5m/s'],
    ['바람 초속 8미터', 8, 'ms', '초속 8미터'],
    ['원정 3일째', 3, 'day', '3일'],
    ['열흘 쉬었다', 10, 'day', '열흘'],
    ['습도 80%', 80, 'percent', '80%'],
    ['치킨 3마리', 3, 'count', '3마리'],
    ['투구수 110개', 110, 'count', '110개'],
    ['원정 9연전', 9, 'count', '9연전'],
    ['구속 150', 150, null, '150'],
  ];

  it.each(CASES)('%s → %d %s', (input, value, unit, raw) => {
    expect(prepareText(input).numbers).toContainEqual({ value, unit, raw });
  });

  it('11개 단위를 모두 뽑는다', () => {
    const units = new Set(CASES.map(([input]) => prepareText(input).numbers.map((n) => n.unit)).flat());
    for (const unit of ['hour', 'minute', 'cup', 'bottle', 'bowl', 'celsius', 'km', 'ms', 'count', 'percent', 'day'] as const) {
      expect(units.has(unit), unit).toBe(true);
    }
  });

  it('체온 문맥("열이 39도")은 celsius이고 raw에 "열"이 들어간다. 날씨 기온은 들어가지 않는다', () => {
    expect(prepareText('열이 39도').numbers).toEqual([{ value: 39, unit: 'celsius', raw: '열이 39도' }]);
    expect(prepareText('체온 38.5도').numbers).toEqual([{ value: 38.5, unit: 'celsius', raw: '체온 38.5도' }]);
    expect(prepareText('기온 39도').numbers).toEqual([{ value: 39, unit: 'celsius', raw: '39도' }]);
  });

  it('도루·도착은 기온이 아니고, 구속 km/h는 거리가 아니다. 여러 숫자는 나온 순서대로', () => {
    expect(prepareText('시즌 30도루').numbers).toEqual([{ value: 30, unit: 'count', raw: '30도루' }]);
    expect(prepareText('구속 150km/h').numbers).toEqual([{ value: 150, unit: null, raw: '150' }]);
    expect(prepareText('3시간 자고 커피 2잔').numbers.map((n) => [n.value, n.unit])).toEqual([[3, 'hour'], [2, 'cup']]);
    expect(prepareText('스코어 5-3').numbers.map((n) => n.value)).toEqual([5, 3]);
    expect(prepareText('숫자 없음').numbers).toEqual([]);
  });
});

describe('절 나누기', () => {
  it('쉼표·그리고·는데·+·&·;·연결 어미 "~고 "로 나눈다', () => {
    expect(texts('타자 치킨, 투수 피자, 포수 떡볶이')).toEqual(['타자 치킨', '투수 피자', '포수 떡볶이']);
    expect(texts('투수 피곤 + 원정팀 버스 이동 + 비')).toEqual(['투수 피곤', '원정팀 버스 이동', '비']);
    expect(texts('비 오고 바람 불고 추움')).toEqual(['비 오고', '바람 불고', '추움']);
    expect(texts('김타자 로또 당첨됐는데 박투수는 악플 봄')).toEqual(['김타자 로또 당첨됐는데', '박투수는 악플 봄']);
    expect(texts('관중 만석 & 폭염; 비')).toEqual(['관중 만석', '폭염', '비']);
    expect(texts('투수 피곤 그리고 타자 긴장')).toEqual(['투수 피곤', '타자 긴장']);
    expect(texts('비 옴. 투수 피곤!')).toEqual(['비 옴', '투수 피곤']);
  });

  it('보조 동사("먹고 옴", "들고 나왔다", "치고 싶어서")와 "최고"는 나누지 않는다', () => {
    expect(texts('투수가 마라탕 먹고 옴')).toEqual(['투수가 마라탕 먹고 옴']);
    expect(texts('김타자가 새 배트를 들고 나왔다')).toEqual(['김타자가 새 배트를 들고 나왔다']);
    expect(texts('홈런 치고 싶어서 새 배트 샀는데 어젯밤 잠을 못 잤대')).toEqual(['홈런 치고 싶어서 새 배트 샀는데', '어젯밤 잠을 못 잤대']);
    expect(texts('최고 구속 3.5km 차이')).toEqual(['최고 구속 3.5km 차이']);
  });

  it('3개가 넘으면 마지막 절에 합친다', () => {
    expect(texts('비 오고, 바람 불고, 추움, 투수 피곤')).toEqual(['비 오고', '바람 불고', '추움, 투수 피곤']);
  });

  it('주어("~는/은/이/가" 앞 명사)를 찾고, 없으면 앞 절에서 이어받는다', () => {
    expect(hints('투수는 짜장면 먹고 타자는 잠 못 잤다')).toEqual(['투수', '타자']);
    expect(hints('김타자는 짜장면 먹고 잠 못 잤다')).toEqual(['김타자', '김타자']);
    expect(hints('박투수가 생일이고, 김타자는 새 배트')).toEqual(['박투수', '김타자']);
    expect(hints('타자 치킨, 투수 피자')).toEqual([null, null]);
    expect(hints('오늘은 비가 오고 박투수는 긴장')).toEqual([null, '박투수']);
    expect(hints('짜장면 먹는 김타자가 졸림')).toEqual(['김타자']);
    expect(hints('kt는 피곤하고 nc는 신남')).toEqual(['kt', 'nc']);
    expect(hints('박투수가 긴장, 잠도 못 잠, 커피 3잔')).toEqual(['박투수', '박투수', '박투수']);
  });

  it('공백·보이지 않는 문자뿐이면 빈 문장·빈 절이다(예외를 던지지 않는다)', () => {
    for (const input of ['', '   ', '​', '\t\n']) {
      expect(prepareText(input)).toEqual({ original: input, normalized: '', intensity: 0, tokens: [], numbers: [], clauses: [] });
    }
  });

  it('기호뿐인 문장도 절 하나로 남긴다', () => {
    expect(prepareText('!!!!').clauses).toEqual([{ text: '!!', subjectHint: null }]);
  });
});

describe('성능', () => {
  it('80자 문장 1,000번이 200ms 안에 끝난다', () => {
    const input = '오늘 경기 전에 박투수가 구단 식당에서 짜장면 곱빼기에 탕수육까지 먹고, 불펜에서 하품 ㅋㅋ 35도 coffee 3잔 🔥';
    expect(Array.from(input).length).toBeLessThanOrEqual(80);
    for (let i = 0; i < 50; i++) prepareText(input);
    // 다른 작업이 도는 기계의 순간 잡음을 줄이려고 세 번 재서 가장 빠른 값을 본다
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) prepareText(input);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(200);
  });
});
