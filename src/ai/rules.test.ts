import { describe, expect, it } from 'vitest';
import type { EvidenceData } from '../types/data';
import type { Interpretation, PromptContext } from '../types/domain';
import { NO_EFFECT_COMMENT, ruleInterpret, rulesVerdict } from './rules';
import { fixtureContext, fixtureEvidence } from './test-helpers';

const on = { measuredAvailable: true };
const off = { measuredAvailable: false };

// 이름으로 대상을 가리는지 보려고 '투수'·'타자'가 들어가지 않은 합성 이름을 쓴다.
// 픽스처 장면은 9회말: 홈 롯데 공격, 원정 KIA 수비.
const ctx: PromptContext = fixtureContext({
  batter: { id: 'h6', name: '타격왕', team: '롯데', bats: 'L' },
  pitcher: { id: 'ap', name: '투구왕', team: 'KIA', throws: 'R' },
  lineupNames: ['타격왕', '발빠른이'],
});
/** 원정 KIA가 공격 중인 장면 */
const awayBatting: PromptContext = { ...ctx, battingTeam: 'KIA', fieldingTeam: '롯데' };

const parts = (text: string, c: PromptContext = ctx, opts = on) => ruleInterpret(text, c, opts).parts;

describe('ruleInterpret', () => {
  it('투수 이름 + 과식 → 투수 체력 −1', () => {
    expect(ruleInterpret('투구왕이 경기 전 짜장면 곱빼기를 먹었다', ctx, on)).toEqual({
      source: 'rules',
      refused: false,
      reason: '',
      comment: '배가 부르면 몸이 무거워진다는 가정',
      parts: [{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '배가 부르면 몸이 무거워진다는 가정' }],
    });
  });

  it('대타가 늦잠 → 타자 집중력 −1 (그럴듯함)', () => {
    expect(parts('대타가 늦잠을 잤다')).toEqual([
      { kind: 'knob', knob: 'focus', subject: 'batter', strength: -1, scope: 'game', evidence: 'plausible', why: '잠이 모자라면 반응과 체력이 떨어져요' },
    ]);
  });

  it('대상: 투수 쪽 말만 있으면 투수, 타자 이름·말이 함께 있거나 아무도 없으면 타자', () => {
    expect(parts('마무리가 늦잠을 잤다')).toMatchObject([{ knob: 'stamina', subject: 'pitcher', strength: -2 }]);
    expect(parts('타격왕이 짜장면 곱빼기를 먹었다')).toMatchObject([{ knob: 'focus', subject: 'batter', strength: -1 }]);
    expect(parts('투구왕이 먹던 짜장면을 타격왕이 뺏어 먹었다')).toMatchObject([{ knob: 'focus', subject: 'batter' }]);
    expect(parts('투수가 짜장면을 먹는 동안 대타가 기다렸다')).toMatchObject([{ knob: 'focus', subject: 'batter' }]);
    expect(parts('발빠른이가 새 배트를 들고 나왔다')).toMatchObject([{ knob: 'contact', subject: 'batter', strength: 1 }]);
    expect(parts('짜장면을 먹었다')).toMatchObject([{ knob: 'focus', subject: 'batter' }]);
    const noName = fixtureContext({ pitcher: { id: 'ap', name: '', team: 'KIA', throws: 'R' }, batter: { id: 'h6', name: '', team: '롯데', bats: 'L' }, lineupNames: [] });
    expect(parts('짜장면을 먹었다', noName)).toMatchObject([{ knob: 'focus', subject: 'batter' }]);
  });

  it.each([
    ['투구왕이 삼계탕을 먹었다', { knob: 'stamina', subject: 'pitcher', strength: 1, scope: 'game', evidence: 'fun' }],
    ['타격왕이 로또에 당첨됐다', { knob: 'focus', subject: 'batter', strength: 1, scope: 'game', evidence: 'fun' }],
    ['투구왕이 악플을 보고 멘붕', { knob: 'nerve', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun' }],
    ['타격왕이 징크스로 빨간 양말을 신었다', { knob: 'focus', subject: 'batter', strength: 1, scope: 'game', evidence: 'fun' }],
    ['포수가 딸꾹질을 멈추지 못한다', { knob: 'control', subject: 'pitcher', strength: -1, scope: 'pa', evidence: 'fun' }],
    ['타격왕이 배트를 바꿨다', { knob: 'contact', subject: 'batter', strength: 1, scope: 'game', evidence: 'fun' }],
    ['타격왕이 새 장갑이 신경 쓰인다', { knob: 'contact', subject: 'batter', strength: -1, scope: 'pa', evidence: 'fun' }],
    ['투구왕의 부모님이 경기장에 오셨다', { knob: 'nerve', subject: 'pitcher', strength: 1, scope: 'game', evidence: 'fun' }],
    ['타격왕이 갑자기 똥이 마려웠다', { knob: 'focus', subject: 'batter', strength: -2, scope: 'pa', evidence: 'fun' }],
    ['투구왕이 화장실이 너무 급했다', { knob: 'control', subject: 'pitcher', strength: -2, scope: 'pa', evidence: 'fun' }],
  ])('사람 규칙: %s', (text, expected) => {
    expect(parts(text)).toMatchObject([{ kind: 'knob', ...expected }]);
  });

  it('투수에게 없는 규칙(새 배트)은 효과가 없다', () => {
    expect(ruleInterpret('투구왕이 새 배트를 샀다', ctx, on)).toMatchObject({ parts: [], comment: NO_EFFECT_COMMENT });
  });

  describe('날씨·일정: measuredAvailable이면 실측 변수, 아니면 대체 손잡이', () => {
    it('폭염 → temp_c 32 / carry +2', () => {
      expect(parts('폭염')).toEqual([{ kind: 'measured', variable: 'temp_c', value: 32, subject: 'everyone', why: expect.any(String) }]);
      expect(parts('폭염', ctx, off)).toEqual([
        { kind: 'knob', knob: 'carry', subject: 'everyone', strength: 2, scope: 'game', evidence: 'plausible', why: expect.any(String) },
      ]);
    });

    it('숫자 + 도는 그 값, 영하는 음수, 도루는 기온이 아니다', () => {
      expect(parts('오늘 기온 35도, 폭염')).toMatchObject([{ variable: 'temp_c', value: 35 }]);
      expect(parts('영하 3도 한파')).toMatchObject([{ variable: 'temp_c', value: -3 }]);
      expect(parts('영하 3도 한파', ctx, off)).toMatchObject([{ knob: 'carry', strength: -2 }]);
      expect(parts('쌀쌀하고 추운 밤')).toMatchObject([{ variable: 'temp_c', value: 8 }]);
      expect(parts('시즌 30도루를 노린다')).toEqual([]);
    });

    it('강풍·바람이 세·태풍 → wind_ms 9, 숫자 m/s는 그 값, 대체 없음', () => {
      expect(parts('강풍이 분다')).toMatchObject([{ variable: 'wind_ms', value: 9, subject: 'everyone' }]);
      expect(parts('바람이 세게 분다')).toMatchObject([{ variable: 'wind_ms', value: 9 }]);
      expect(parts('바람이 12m/s로 분다')).toMatchObject([{ variable: 'wind_ms', value: 12 }]);
      expect(parts('태풍이 온다', ctx, off)).toEqual([]);
    });

    it('비 → rain_pre3h 3 / slick +2, "준비가"는 비가 아니다', () => {
      expect(parts('경기 전에 비가 왔다')).toMatchObject([{ variable: 'rain_pre3h', value: 3, subject: 'everyone' }]);
      expect(parts('그라운드가 젖은 채로 시작', ctx, off)).toMatchObject([{ knob: 'slick', subject: 'everyone', strength: 2, scope: 'game', evidence: 'plausible' }]);
      expect(parts('준비가 덜 된 경기')).toEqual([]);
    });

    it('낮 경기 → day_game 1 / glare +1 (이번 타석)', () => {
      expect(parts('낮 경기라 땡볕이다')).toMatchObject([{ variable: 'day_game', value: 1, subject: 'everyone' }]);
      expect(parts('햇빛이 강하다', ctx, off)).toMatchObject([{ knob: 'glare', subject: 'everyone', strength: 1, scope: 'pa', evidence: 'plausible' }]);
    });

    it('주말 → weekend 1, 대체 없음', () => {
      expect(parts('일요일 경기')).toMatchObject([{ variable: 'weekend', value: 1, subject: 'everyone' }]);
      expect(parts('토요일 경기', ctx, off)).toEqual([]);
    });

    it('원정 이동 → travel_km 350 공격팀 / mood −1, 팀을 말하면 그 팀', () => {
      expect(parts('버스로 5시간 이동했다')).toMatchObject([{ variable: 'travel_km', value: 350, subject: 'battingTeam' }]);
      expect(parts('장거리 이동 뒤 경기', ctx, off)).toMatchObject([{ knob: 'mood', subject: 'battingTeam', strength: -1, evidence: 'fun' }]);
      expect(parts('원정팀이 버스로 5시간 이동했다')).toMatchObject([{ variable: 'travel_km', subject: 'fieldingTeam' }]);
      expect(parts('원정팀이 버스로 5시간 이동했다', awayBatting)).toMatchObject([{ variable: 'travel_km', subject: 'battingTeam' }]);
      expect(parts('KIA 선수단이 원정길에 올랐다')).toMatchObject([{ variable: 'travel_km', subject: 'fieldingTeam' }]);
    });

    it('휴식 → after_off_day 1 공격팀 / mood +1', () => {
      expect(parts('휴식일 다음 경기')).toMatchObject([{ variable: 'after_off_day', value: 1, subject: 'battingTeam' }]);
      expect(parts('어제 푹 쉬고 왔다', ctx, off)).toMatchObject([{ knob: 'mood', subject: 'battingTeam', strength: 1, evidence: 'fun' }]);
    });

    it('선발 짧은 휴식 → starter_short_rest / stamina −1, 긴 휴식 → starter_long_rest / control −1', () => {
      expect(parts('선발이 짧게 쉬고 나왔다')).toMatchObject([{ variable: 'starter_short_rest', value: 1, subject: 'pitcher' }]);
      expect(parts('선발을 당겨서 올렸다', ctx, off)).toMatchObject([{ knob: 'stamina', subject: 'pitcher', strength: -1, evidence: 'plausible' }]);
      expect(parts('선발이 열흘 만에 복귀했다')).toMatchObject([{ variable: 'starter_long_rest', value: 1, subject: 'pitcher' }]);
      expect(parts('선발이 오래 쉬고 나왔다', ctx, off)).toMatchObject([{ knob: 'control', subject: 'pitcher', strength: -1, evidence: 'fun' }]);
      expect(parts('주전이 복귀했다')).toEqual([]);
    });
  });

  it('관중·응원 → 홈 팀 mood +1 (홈 공격이면 공격팀, 아니면 수비팀)', () => {
    expect(parts('관중 2만 명이 떼창 중')).toMatchObject([{ kind: 'knob', knob: 'mood', subject: 'battingTeam', strength: 1 }]);
    expect(parts('관중 2만 명이 떼창 중', awayBatting)).toMatchObject([{ knob: 'mood', subject: 'fieldingTeam', strength: 1 }]);
  });

  it('최대 3개, 같은 손잡이·대상은 첫 번째만, comment는 첫 규칙의 why', () => {
    const out = ruleInterpret('투구왕이 짜장면 먹고 늦잠 자고 로또 당첨, 폭염에 비까지 왔다', ctx, on);
    expect(out.parts).toMatchObject([
      { kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1 },
      { kind: 'knob', knob: 'nerve', subject: 'pitcher', strength: 1 },
      { kind: 'measured', variable: 'temp_c', value: 32 },
    ]);
    expect(out.comment).toBe('배가 부르면 몸이 무거워진다는 가정');
  });

  it('뜻 없는 문장 → parts [] + 기본 해설', () => {
    expect(NO_EFFECT_COMMENT).toBe('승부와 이어 붙일 방법이 없는 변수로 판정했어요. 차이는 0이에요.');
    expect(ruleInterpret('외계인이 우주선에서 경기를 본다', ctx, on)).toEqual({
      source: 'rules', refused: false, reason: '', comment: NO_EFFECT_COMMENT, parts: [],
    });
  });
});

describe('rulesVerdict', () => {
  const evidence = fixtureEvidence();
  const knobOnly = (text: string): Interpretation => ruleInterpret(text, ctx, off);

  it('evidence가 null이면 unmeasurable', () => {
    expect(rulesVerdict('폭염', knobOnly('폭염'), null)).toMatchObject({
      source: 'rules', variables: [], verdict: 'unmeasurable', headline: '판정 데이터가 아직 없어요',
    });
  });

  it('후보가 없으면 기록으로 잴 수 없는 변수', () => {
    expect(rulesVerdict('짜장면을 먹었다', knobOnly('짜장면을 먹었다'), evidence)).toEqual({
      source: 'rules',
      variables: [],
      verdict: 'unmeasurable',
      headline: '기록으로 잴 수 없는 변수예요',
      body: '이런 이야기는 경기 기록에 남지 않아 실제 효과를 잴 수 없어요.',
    });
    // evidence에 항목이 없는 변수(wind_ms)도 잴 수 없다
    expect(rulesVerdict('강풍', ruleInterpret('강풍', ctx, on), evidence)).toMatchObject({ variables: [], verdict: 'unmeasurable' });
  });

  it('해석의 실측 변수 먼저, 그다음 키워드 변수. 판정·문구는 첫 변수 item', () => {
    const ai: Interpretation = {
      source: 'ai', refused: false, reason: '', comment: '',
      parts: [{ kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '' }],
    };
    expect(rulesVerdict('땡볕 낮 경기', ai, evidence)).toEqual({
      source: 'rules',
      variables: ['temp_c', 'day_game'],
      verdict: 'maybe',
      headline: '있을 수도, 없을 수도 있어요',
      body: evidence.items[0].note,
    });
    expect(rulesVerdict('땡볕 낮 경기', knobOnly('땡볕 낮 경기'), evidence)).toEqual({
      source: 'rules',
      variables: ['day_game'],
      verdict: 'useless',
      headline: '쓸모없는 변수로 판정됐어요',
      body: evidence.items[1].note,
    });
  });

  it('real 판정 문구', () => {
    const realEvidence: EvidenceData = { ...evidence, items: evidence.items.map((item) => ({ ...item, verdict: 'real' as const })) };
    expect(rulesVerdict('폭염', knobOnly('폭염'), realEvidence)).toMatchObject({ verdict: 'real', headline: '기록으로 확인된 효과예요' });
  });
});
