import { describe, expect, it } from 'vitest';
import type { PromptContext, Subject } from '../types/domain';
import { resolveTarget, TEAM_ALIASES } from './targets';
import type { TargetResolution } from './targets';
import { fixtureContext } from './test-helpers';
import { prepareText } from './text';

/*
 * 대상 추론 테스트. 가상 이름만 쓴다: 지금 타자 김타자·투수 박투수,
 * 공격 타순(KIA)은 옛이야기 인물, 수비 타순(롯데)은 전래동화 인물, 장면 밖 선수는 서유기 인물.
 */

const BATTING = ['홍길동', '이몽룡', '성춘향', '김타자', '변학도', '심학규', '임꺽정', '전우치', '홍판서'];
const FIELDING = ['최수비', '놀부', '흥부', '콩쥐', '팥쥐', '옹고집', '심청', '뺑덕', '토생원'];
const roster = (names: readonly string[]) => names.map((name, i) => ({ id: `${name}-${i + 1}`, name, slot: i + 1 }));

/** awayBatting이면 원정 KIA 공격(초), 아니면 홈 롯데 공격(말) */
function sceneCtx(awayBatting: boolean, over: Partial<PromptContext> = {}): PromptContext {
  const battingTeam = awayBatting ? 'KIA' : '롯데';
  const fieldingTeam = awayBatting ? '롯데' : 'KIA';
  const [batting, fielding] = awayBatting ? [BATTING, FIELDING] : [FIELDING, BATTING];
  return fixtureContext({
    awayName: 'KIA',
    homeName: '롯데',
    battingTeam,
    fieldingTeam,
    batter: { id: 'b', name: '김타자', team: battingTeam, bats: 'R' },
    pitcher: { id: 'p', name: '박투수', team: fieldingTeam, throws: 'R' },
    lineupNames: [...batting, ...fielding],
    battingLineup: roster(batting),
    fieldingLineup: roster(fielding),
    otherPlayers: [
      { name: '손오공', team: 'KIA', kind: 'P' },
      { name: '저팔계', team: '롯데', kind: 'H' },
      { name: '사오정', team: '두산', kind: 'H' },
    ],
    ...over,
  });
}

const away = sceneCtx(true);
const home = sceneCtx(false);

const resolveAll = (text: string, c: PromptContext = away): TargetResolution[] => {
  const prepared = prepareText(text);
  return prepared.clauses.map((clause) => resolveTarget(clause, prepared, c));
};
const resolve = (text: string, c: PromptContext = away): TargetResolution => resolveAll(text, c)[0];

const BATTER = { subject: 'batter', label: '김타자', teamOnly: false } as const;
const PITCHER = { subject: 'pitcher', label: '박투수', teamOnly: false } as const;

describe('1. 받는 사람', () => {
  it.each([
    ['사오정이 김타자에게 새 배트를 선물했다', BATTER],
    ['박투수한테 야유', PITCHER],
    ['관중이 박투수 위해 응원가', PITCHER],
    ['해설위원이 김타자 칭찬함', BATTER],
    ['홍길동이 전우치한테 짜장면 쐈다', { subject: 'battingTeam', label: '전우치', teamOnly: true }],
  ] as const)('%s', (text, expected) => {
    expect(resolve(text)).toEqual({ ...expected, via: 'recipient' });
  });

  it('받는 사람 규칙이 보내는 사람 이름보다 먼저 걸린다', () => {
    expect(resolve('박투수가 김타자에게 응원 문자를 보냈다')).toEqual({ ...BATTER, via: 'recipient' });
    expect(resolve('김타자가 박투수한테 커피를 샀다')).toEqual({ ...PITCHER, via: 'recipient' });
  });
});

describe('2. 이름', () => {
  it('지금 타자·투수의 성+이름', () => {
    expect(resolve('박투수가 경기 전 짜장면 곱빼기를 먹었다')).toEqual({ ...PITCHER, via: 'name' });
    expect(resolve('김타자 오늘 컨디션 최고래')).toEqual({ ...BATTER, via: 'name' });
  });

  it('이름만(두 글자 이상)', () => {
    const c = sceneCtx(true, {
      batter: { id: 'b', name: '전우치', team: 'KIA', bats: 'L' },
      pitcher: { id: 'p', name: '토생원', team: '롯데', throws: 'L' },
    });
    expect(resolve('우치가 새 배트 들고 나옴', c)).toEqual({ subject: 'batter', label: '전우치', via: 'name', teamOnly: false });
    expect(resolve('생원이 짜장면 곱빼기 먹음', c)).toEqual({ subject: 'pitcher', label: '토생원', via: 'name', teamOnly: false });
  });

  it('"성+선수"는 장면에서 그 성이 한 명일 때만', () => {
    expect(resolve('박선수 긴장했나봄')).toEqual({ ...PITCHER, via: 'name' });
    expect(resolve('김 선수 오늘 생일')).toEqual({ ...BATTER, via: 'name' });
    // 홍길동·홍판서 두 명이라 누구인지 모른다
    expect(resolve('홍선수 긴장했나봄')).toEqual({ ...BATTER, via: 'default' });
  });
});

describe('3. 타순·장면 밖 선수', () => {
  it('공격 팀 타순의 다른 선수는 공격 팀, 수비 팀 타순 선수는 수비 팀(teamOnly)', () => {
    expect(resolve('홍길동이 더그아웃에서 짜장면 곱빼기를 먹었다')).toEqual({ subject: 'battingTeam', label: '홍길동', via: 'lineup', teamOnly: true });
    expect(resolve('흥부가 어젯밤 잠을 못 잤다')).toEqual({ subject: 'fieldingTeam', label: '흥부', via: 'lineup', teamOnly: true });
    expect(resolve('대기 타석의 이몽룡이 하품했다')).toMatchObject({ subject: 'battingTeam', via: 'lineup' });
  });

  it('홈 공격 장면에서는 같은 선수의 진영이 뒤집힌다', () => {
    expect(resolve('홍길동이 더그아웃에서 짜장면 곱빼기를 먹었다', home)).toMatchObject({ subject: 'fieldingTeam', via: 'lineup', teamOnly: true });
    expect(resolve('흥부가 어젯밤 잠을 못 잤다', home)).toMatchObject({ subject: 'battingTeam', via: 'lineup', teamOnly: true });
  });

  it('장면 팀의 장면 밖 선수는 그 팀, 장면 밖 팀 선수는 다음 규칙(팀 → everyone)', () => {
    expect(resolve('손오공이 불펜에서 몸 풀었다')).toEqual({ subject: 'battingTeam', label: '손오공', via: 'lineup', teamOnly: true });
    expect(resolve('저팔계 관중석에서 직관 중')).toEqual({ subject: 'fieldingTeam', label: '저팔계', via: 'lineup', teamOnly: true });
    expect(resolve('사오정이 다른 구장에서 홈런 쳤대')).toEqual({ subject: 'everyone', label: '사오정', via: 'team', teamOnly: false });
  });
});

describe('4. 역할어', () => {
  it('투수·선발·마무리·불펜·에이스는 투수, 타자·대타는 타자', () => {
    expect(resolve('마무리가 늦잠을 잤다')).toEqual({ ...PITCHER, via: 'role' });
    expect(resolve('에이스가 오늘 좀 떨린대')).toEqual({ ...PITCHER, via: 'role' });
    expect(resolve('선발 투수 오늘 피곤해 보임')).toEqual({ ...PITCHER, via: 'role' });
    expect(resolve('대타가 늦잠을 잤다')).toEqual({ ...BATTER, via: 'role' });
    expect(resolve('타자 긴장한 표정')).toEqual({ ...BATTER, via: 'role' });
    expect(resolve('pitcher drank 3 coffees')).toEqual({ ...PITCHER, via: 'role' });
  });

  it('포수·유격수·수비는 수비 팀(teamOnly)', () => {
    expect(resolve('포수가 사인을 자꾸 헷갈린다')).toEqual({ subject: 'fieldingTeam', label: '포수', via: 'role', teamOnly: true });
    expect(resolve('유격수가 오늘 실책 2개 했다')).toMatchObject({ subject: 'fieldingTeam', via: 'role', teamOnly: true });
    expect(resolve('수비진 어제 회식했대')).toMatchObject({ subject: 'fieldingTeam', via: 'role', teamOnly: true });
  });

  it('팀을 밝히지 않은 감독·코치·벤치는 "공격 팀 벤치", 팀을 밝히면 그 팀', () => {
    expect(resolve('코치가 짜장면 곱빼기를 먹었다')).toEqual({ subject: 'battingTeam', label: '공격 팀 벤치', via: 'role', teamOnly: true });
    expect(resolve('투수 코치가 짜장면 먹음')).toEqual({ subject: 'battingTeam', label: '공격 팀 벤치', via: 'role', teamOnly: true });
    expect(resolve('롯데 감독이 항의하다 퇴장당했다')).toEqual({ subject: 'fieldingTeam', label: '롯데 벤치', via: 'role', teamOnly: true });
  });

  it('주심·심판·캐스터·해설은 everyone', () => {
    expect(resolve('주심이 어젯밤 잠을 설쳤다')).toEqual({ subject: 'everyone', label: '주심', via: 'role', teamOnly: false });
    expect(resolve('캐스터가 목이 쉬었다')).toMatchObject({ subject: 'everyone', via: 'role' });
    expect(resolve('심판 스트라이크 존이 오늘 넓다')).toMatchObject({ subject: 'everyone', via: 'role' });
  });

  it('관중·팬·응원단·치어리더는 홈 팀, 원정 팬은 원정 팀 (공격·수비는 ctx.battingTeam과 homeName으로 정한다)', () => {
    expect(resolve('관중이 파도타기 중')).toEqual({ subject: 'fieldingTeam', label: '홈 팬', via: 'role', teamOnly: true });
    expect(resolve('치어리더가 새 응원 준비함')).toMatchObject({ subject: 'fieldingTeam', via: 'role' });
    expect(resolve('원정 팬들 응원가 떼창')).toEqual({ subject: 'battingTeam', label: '원정 팬', via: 'role', teamOnly: true });
    expect(resolve('관중이 파도타기 중', home)).toMatchObject({ subject: 'battingTeam', label: '홈 팬' });
    expect(resolve('치어리더가 새 응원 준비함', home)).toMatchObject({ subject: 'battingTeam' });
    expect(resolve('원정 팬들 응원가 떼창', home)).toMatchObject({ subject: 'fieldingTeam', label: '원정 팬' });
  });

  it('선수 가족은 그 선수다', () => {
    expect(resolve('투수 어머니가 경기장에 오셨다')).toEqual({ ...PITCHER, via: 'role' });
    expect(resolve('타자 아내가 직관 옴')).toEqual({ ...BATTER, via: 'role' });
  });
});

describe('5. 팀 이름·별칭', () => {
  it('10개 구단 별칭 사전', () => {
    expect(Object.keys(TEAM_ALIASES).sort()).toEqual(['HH', 'HT', 'KT', 'LG', 'LT', 'NC', 'OB', 'SK', 'SS', 'WO']);
    for (const aliases of Object.values(TEAM_ALIASES)) expect(aliases.length).toBeGreaterThanOrEqual(3);
    expect(TEAM_ALIASES.HT).toEqual(expect.arrayContaining(['기아', '타이거즈', '호랑이']));
    expect(TEAM_ALIASES.OB).toEqual(expect.arrayContaining(['베어스', '곰']));
  });

  it('장면 두 팀이면 그 팀(teamOnly), 아니면 everyone', () => {
    expect(resolve('KIA 선수들 오늘 다 피곤함')).toEqual({ subject: 'battingTeam', label: 'KIA', via: 'team', teamOnly: true });
    expect(resolve('거인 타선이 요즘 물방망이')).toEqual({ subject: 'fieldingTeam', label: '롯데', via: 'team', teamOnly: true });
    expect(resolve('기아 더그아웃 분위기 최고')).toMatchObject({ subject: 'battingTeam', teamOnly: true });
    expect(resolve('kia tigers 파이팅')).toMatchObject({ subject: 'battingTeam', via: 'team' });
    expect(resolve('곰들이 어제 이겼대')).toEqual({ subject: 'everyone', label: '두산', via: 'team', teamOnly: false });
    expect(resolve('독수리 군단 연패 중')).toMatchObject({ subject: 'everyone', via: 'team' });
  });

  it('원정팀·홈팀', () => {
    expect(resolve('원정팀이 버스로 5시간 이동했다')).toEqual({ subject: 'battingTeam', label: '원정 팀', via: 'team', teamOnly: true });
    expect(resolve('홈팀 선수들 집에서 푹 쉬고 왔다')).toEqual({ subject: 'fieldingTeam', label: '홈 팀', via: 'team', teamOnly: true });
    expect(resolve('원정팀이 버스로 5시간 이동했다', home)).toMatchObject({ subject: 'fieldingTeam', label: '원정 팀' });
    expect(resolve('KTX 타고 왔다').via).not.toBe('team');
  });
});

describe('6. 동사 단서', () => {
  it('던지다·투구·구속·볼넷 내주다는 투수', () => {
    expect(resolve('짜장면 먹으면 못 던져?')).toEqual({ ...PITCHER, via: 'verb' });
    expect(resolve('오늘 구속 150 넘게 나옴')).toEqual({ ...PITCHER, via: 'verb' });
    expect(resolve('볼넷 내주고 멘붕')).toMatchObject({ subject: 'pitcher', via: 'verb' });
  });

  it('치다·스윙·홈런 치다·도루는 타자', () => {
    expect(resolve('홈런 쳐라')).toEqual({ ...BATTER, via: 'verb' });
    expect(resolve('스윙이 무겁다')).toEqual({ ...BATTER, via: 'verb' });
    expect(resolve('잠 못 자면 삼진 당함?')).toMatchObject({ subject: 'batter', via: 'verb' });
    expect(resolve('도루 준비 완료')).toMatchObject({ subject: 'batter', via: 'verb' });
  });

  it('잡다·실책·송구는 수비 팀', () => {
    expect(resolve('실책 2개')).toEqual({ subject: 'fieldingTeam', label: '수비 팀', via: 'verb', teamOnly: true });
    expect(resolve('송구가 자꾸 빗나감')).toMatchObject({ subject: 'fieldingTeam', via: 'verb' });
  });
});

describe('7. 기본값', () => {
  it('아무 단서가 없으면 지금 타자', () => {
    expect(resolve('짜장면을 먹었다')).toEqual({ ...BATTER, via: 'default' });
    expect(resolve('외계인이 우주선에서 경기를 본다')).toEqual({ ...BATTER, via: 'default' });
    expect(resolve('치킨 먹고 치어리더 공연 봄')).not.toMatchObject({ via: 'verb' });
  });
});

describe('절과 주어', () => {
  it('주어가 없는 절은 앞 절 주어를 이어받는다', () => {
    expect(resolveAll('박투수는 짜장면 먹고 잠 못 잤다')).toEqual([
      { ...PITCHER, via: 'name' },
      { ...PITCHER, via: 'name' },
    ]);
    expect(resolveAll('박투수 짜장면 먹고, 잠 못 잠').map((r) => r.subject)).toEqual(['pitcher', 'pitcher']);
  });

  it('절 안에 다른 사람이 나오면 이어받은 주어보다 그 사람이 먼저다', () => {
    expect(resolveAll('김타자는 짜장면 먹고 박투수 긴장').map((r) => [r.subject, r.via])).toEqual([
      ['batter', 'name'],
      ['pitcher', 'name'],
    ]);
    expect(resolveAll('투수는 짜장면 먹고 타자는 잠 못 잤다').map((r) => r.subject)).toEqual(['pitcher', 'batter']);
    expect(resolveAll('타자 치킨, 투수 피자, 포수 떡볶이').map((r) => r.subject)).toEqual(['batter', 'pitcher', 'fieldingTeam']);
  });

  it('Subject는 domain.ts의 다섯 값뿐이다', () => {
    const SUBJECTS: readonly Subject[] = ['batter', 'pitcher', 'battingTeam', 'fieldingTeam', 'everyone'];
    const texts = ['관중 만석', '곰들이 어제 이겼대', '포수 피곤', '박투수 긴장', '짜장면', '원정 팬 떼창', '주심 졸림', '손오공 생일'];
    for (const text of texts) {
      for (const c of [away, home]) expect(SUBJECTS).toContain(resolve(text, c).subject);
    }
  });
});
