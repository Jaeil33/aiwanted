import { describe, expect, it } from 'vitest';
import type { PromptContext } from '../types/domain';
import { assessSafety, checkSensitive, SENSITIVE_REASON, SLUR_REASON } from './safety';
import type { SensitiveCategory } from './safety';
import { fixtureContext } from './test-helpers';
import { prepareText } from './text';

/*
 * 안전 판정 테스트. 가상 이름만 쓴다(실존 선수 이름과 민감한 문장을 함께 두지 않는다).
 * 김타자(타자)·박투수(투수)·이공격(공격 타순)·최수비(수비 타순)·정외부·윤한결(장면 밖 선수).
 */

const ctx: PromptContext = fixtureContext({
  batter: { id: 'h6', name: '김타자', team: '롯데', bats: 'L' },
  pitcher: { id: 'ap', name: '박투수', team: 'KIA', throws: 'R' },
  lineupNames: ['김타자', '이공격', '최수비'],
  battingLineup: [
    { id: 'h1', name: '이공격', slot: 1 },
    { id: 'h6', name: '김타자', slot: 6 },
  ],
  fieldingLineup: [{ id: 'a1', name: '최수비', slot: 1 }],
  otherPlayers: [
    { name: '정외부', team: '한화', kind: 'H' },
    { name: '윤한결', team: '두산', kind: 'P' },
  ],
});

const assess = (text: string, c: PromptContext | null = ctx) => assessSafety(prepareText(text), c);

describe('문구', () => {
  it('거부 문구는 UI_GUIDE를 따른다', () => {
    expect(SENSITIVE_REASON).toBe('선수 건강·사생활·범죄 이야기는 계산하지 않아요. 음식·잠·날씨·징크스로 바꿔 보세요.');
    expect(SLUR_REASON).toBe('사람을 깎아내리는 말은 계산하지 않아요.');
  });
});

describe('assessSafety: 사람에게 걸린 민감어는 block', () => {
  const BLOCKS: Array<[SensitiveCategory, string]> = [
    ['crime', '이공격이 어젯밤 음주운전을 했다'],
    ['crime', '박투수 전과 2범이래'],
    ['crime', '최수비 경찰에 체포됐다'],
    ['alcohol', '박투수가 어제 소주 3병 깠다'],
    ['alcohol', '김타자 전날 과음함'],
    ['alcohol', '투수가 회식에서 폭탄주 10잔'],
    ['alcohol', 'pitcher is drunk'],
    ['gambling', '박투수 도박 빚이 있다더라'],
    ['gambling', '김타자 승부조작 연루설'],
    ['gambling', '정외부 사설 토토에 빠졌대'],
    ['violence', '박투수 학폭 논란'],
    ['violence', '박투수 팬 폭행'],
    ['violence', '감독이 선수 멱살 잡았다'],
    ['drugs', '김타자가 대마초 피웠다'],
    ['drugs', '박투수 금지 약물 복용'],
    ['drugs', '최수비 필로폰 투약'],
    ['illness', '김타자 감기 몸살로 열이 39도'],
    ['illness', '박투수 우울증 약 먹는 중'],
    ['illness', '최수비 코로나 확진'],
    ['illness', '윤한결 공황장애 치료 중'],
    ['illness', '박투수 암 걸림'],
    ['injury', '박투수 햄스트링 올라옴'],
    ['injury', '김타자 어깨 부상 숨기고 뛴다'],
    ['injury', '최수비 팔꿈치 인대 끊어짐'],
    ['injury', '포수가 담 걸렸다'],
    ['death', '박투수 어머니가 돌아가셨다'],
    ['death', '김타자 아버지 부고'],
    ['death', '최수비 가족이 사망했다'],
    ['privacy', '김타자가 여자친구랑 헤어졌다'],
    ['privacy', '박투수 이혼 소송 중'],
    ['privacy', '최수비 집 주소 알아냄'],
    ['privacy', '이공격이 여자랑 모텔 들어가는 거 봤음'],
    ['privacy', '한결이 열애설'],
    ['sexual', '김타자 성추행 논란'],
    ['sexual', '박투수 몰카 찍었대'],
    ['sexual', '이공격 음란 영상 유포'],
    ['slur', '박투수 살쪄서 완전 돼지'],
  ];

  it.each(BLOCKS)('%s: %s', (category, text) => {
    const out = assess(text);
    expect(out).toMatchObject({ level: 'block', category, reason: category === 'slur' ? SLUR_REASON : SENSITIVE_REASON });
    expect(out.matched).toEqual(expect.any(String));
  });

  it('범주마다 3개 이상, CLAUDE.md 거부 범주를 모두 덮는다', () => {
    const all: SensitiveCategory[] = ['crime', 'alcohol', 'gambling', 'violence', 'drugs', 'illness', 'injury', 'death', 'privacy', 'sexual'];
    for (const category of all) expect(BLOCKS.filter(([c]) => c === category).length, category).toBeGreaterThanOrEqual(3);
  });

  it('판정에 쓴 표현을 matched에 담는다', () => {
    expect(assess('박투수가 어제 소주 3병 깠다').matched).toBe('소주');
    expect(assess('김타자 열이 39도').matched).toBe('열이 39도');
  });
});

describe('비하 표현은 주체와 상관없이 block', () => {
  it.each(['김타자 병신 같다', '박투수 ㅂㅅ같이 침', '짱깨 같은 놈', '저 씹새끼', '흑형이라 파워 좋음', '관중이 ㅅㅂ 외쳤다'])('%s', (text) => {
    expect(assess(text)).toMatchObject({ level: 'block', category: 'slur', reason: SLUR_REASON });
    expect(assess(text, null)).toMatchObject({ level: 'block', category: 'slur' });
  });
});

describe('허용 관용구·사물은 막지 않는다', () => {
  it.each([
    '박투수가 마약김밥 먹었다',
    '김타자 마약떡볶이 두 그릇',
    '롯데 자살 스퀴즈 작전 준비',
    '김타자 타격감이 죽었다',
    '박투수 구위가 죽었다',
    '김타자 방망이가 죽었다',
    '박투수 등장곡이 이별 노래',
    '김타자 누드김밥 먹음',
    '김타자 벙어리장갑 끼고 나옴',
    '대머리독수리가 외야에 날아왔다',
    '관중이 김타자 등신대 들고 왔다',
    'KIA 감독의 도박 같은 투수 교체',
  ])('관용구: %s', (text) => {
    expect(assess(text)).toEqual({ level: 'allow', category: null, reason: '', matched: null });
  });

  it.each([
    '김타자 술술 풀리는 날',
    '박투수 구속 150 찍힘',
    '김타자 뚱뚱한 배트 들고 나옴',
    '박투수 바람 부는 방향 체크함',
    '바람을 피해 더그아웃으로 들어갔다',
    '김타자 헤어스타일 바꿈',
    '김타자 엄마가 병원 간호사다',
    '김타자 결혼 1주년',
    '김타자 딸 돌잔치',
    '김타자 딸꾹질 시작',
    '박투수 피곤해 죽겠다',
    '팀 사기가 올랐다',
    '고소한 냄새가 난다',
    '9회말이 역전의 시발점이다',
    '타자가 배팅 연습을 했다',
    '김타자가 홈런을 때렸다',
    '투수가 아파트 층간 소음에 늦잠',
    '아프리카 여행 사진을 봤다',
    '장애인석 옆에서 응원했다',
    '앱 업데이트를 하고 왔다',
    '키스톤 콤비 호흡이 좋다',
    '박투수 와인드업이 크다',
    '토요일 경기',
    '주자가 죽었다',
    '돼지국밥을 먹고 왔다',
    '새끼손가락에 반창고를 붙였다',
    '구단 영상 썸네일이 바뀌었다',
    '승률 게이지가 올라갔다',
    '타자가 오늘 생일이다',
    '어제 득녀했다',
    '투수 커피 5잔 마심',
    '',
  ])('경계: "%s"', (text) => {
    expect(assess(text).level).toBe('allow');
  });
});

describe('사람이 아닌 주체에만 걸리면 allow', () => {
  it.each([
    '관중이 맥주를 마셨다',
    '관중석에서 술 마시는 아저씨',
    '반려견이 아프다',
    '키우던 강아지가 죽었다',
    '치어리더가 감기에 걸렸다',
    '캐스터가 목감기로 고생',
    '고양이가 다쳤다',
    '팬들이 소주 파티',
    '게임 캐릭터가 죽었다',
    '원정 응원단이 술에 취했다',
    'crowd drank beer',
  ])('%s', (text) => {
    expect(assess(text)).toEqual({ level: 'allow', category: null, reason: '', matched: null });
  });
});

describe('주체를 모르면 review', () => {
  it.each([
    ['alcohol', '어젯밤 소주 3병'],
    ['gambling', '누가 도박했대'],
    ['illness', '열이 39도'],
    ['privacy', '여자친구랑 헤어졌대'],
    ['gambling', '구단이 승부조작 의혹'],
  ] as const)('%s: %s', (category, text) => {
    expect(assess(text)).toMatchObject({ level: 'review', category, reason: SENSITIVE_REASON });
  });
});

describe('체온과 기온', () => {
  it('체온 "열이 39도"는 사람에게 걸리면 block, 날씨 "기온 39도"는 allow', () => {
    expect(assess('김타자 열이 39도')).toMatchObject({ level: 'block', category: 'illness' });
    expect(assess('기온 39도').level).toBe('allow');
    expect(assess('오늘 39도 폭염에 박투수 땀 범벅').level).toBe('allow');
  });
});

describe('절과 주어', () => {
  it('절마다 주어를 따로 본다', () => {
    expect(assess('관중이 맥주를 마셨고 박투수는 짜장면 곱빼기').level).toBe('allow');
    expect(assess('김타자는 짜장면 먹고 박투수는 소주 3병')).toMatchObject({ level: 'block', category: 'alcohol' });
  });

  it('주어 없는 절은 앞 절의 사람을 이어받는다', () => {
    expect(assess('김타자 짜장면 먹고 소주 3병')).toMatchObject({ level: 'block', category: 'alcohol' });
  });
});

describe('ctx가 null이면 역할어·가족어로만 주체를 본다', () => {
  it('역할어·가족어는 사람, 이름은 모른다', () => {
    expect(assess('투수가 어젯밤 음주운전을 했다', null)).toMatchObject({ level: 'block', category: 'crime' });
    expect(assess('어머니가 돌아가셨다', null)).toMatchObject({ level: 'block', category: 'death' });
    expect(assess('이공격이 음주운전을 했다', null)).toMatchObject({ level: 'review', category: 'crime' });
    expect(assess('관중이 맥주를 마셨다', null).level).toBe('allow');
  });
});

describe('checkSensitive (호환)', () => {
  it('assessSafety(prepareText(text), null)이 block일 때만 막는다', () => {
    expect(checkSensitive('투수가 어젯밤 음주운전을 했다')).toEqual({ blocked: true, reason: SENSITIVE_REASON });
    expect(checkSensitive('저 선수 병신')).toEqual({ blocked: true, reason: SLUR_REASON });
    expect(checkSensitive('어젯밤 소주 3병')).toEqual({ blocked: false, reason: '' });
    expect(checkSensitive('관중이 맥주를 마셨다')).toEqual({ blocked: false, reason: '' });
    expect(checkSensitive('키우던 강아지가 죽었다')).toEqual({ blocked: false, reason: '' });
    expect(checkSensitive('투수가 마약김밥 먹었다')).toEqual({ blocked: false, reason: '' });
    expect(checkSensitive('')).toEqual({ blocked: false, reason: '' });
    for (const text of ['타자가 원정 숙소에서 도박을 했다', '원정투수가 어젯밤 음주운전을 했다', '비가 온다', '어머니가 암 진단']) {
      expect(checkSensitive(text).blocked, text).toBe(assessSafety(prepareText(text), null).level === 'block');
    }
  });
});
