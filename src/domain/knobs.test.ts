import { describe, expect, it } from 'vitest';
import type { KnobId, KnobWho } from '../types/domain';
import { KNOB_IDS, KNOB_META, SUBJECTS_FOR, SUBJECT_LABEL } from './knobs';

const ORDER: KnobId[] = [
  'contact', 'power', 'eye', 'focus', 'speed',
  'stuff', 'control', 'stamina', 'nerve',
  'defense', 'carry', 'slick', 'glare', 'mood',
];

describe('KNOB_IDS', () => {
  it('프로토타입 KNOBS 순서의 손잡이 14개', () => {
    expect(KNOB_IDS).toEqual(ORDER);
    expect(new Set(KNOB_IDS).size).toBe(14);
  });
});

describe('KNOB_META', () => {
  it('모든 손잡이에 메타가 있고 그 밖의 키는 없다', () => {
    expect(Object.keys(KNOB_META).sort()).toEqual([...ORDER].sort());
  });

  it('라벨은 프로토타입 engine.js와 같다', () => {
    expect(KNOB_IDS.map((id) => KNOB_META[id].label)).toEqual([
      '컨택', '파워', '선구안', '집중력', '주력',
      '구위', '제구', '체력', '멘탈',
      '수비', '타구 비거리', '미끄러운 공', '시야 방해', '팀 분위기',
    ]);
  });

  it('설명은 프로토타입 app.js KNOB_HINT와 같다', () => {
    expect(KNOB_IDS.map((id) => KNOB_META[id].hint)).toEqual([
      '공을 더 잘 맞힘, 삼진 감소',
      '장타·홈런 증가',
      '볼넷 증가, 삼진 감소',
      '타자에게 전반적으로 유리',
      '내야안타·3루타 증가',
      '삼진 증가, 피안타 감소',
      '볼넷 감소',
      '피안타·볼넷 감소',
      '위기에서 볼넷·홈런 감소',
      '안타가 아웃으로 바뀜',
      '홈런·장타 증가 (바람·기온)',
      '볼넷 증가, 삼진 감소 (비·습도·땀)',
      '타자가 공을 보기 어려워 삼진 증가',
      '그 팀에 전반적으로 유리',
    ]);
  });

  it('손잡이 대상(who)은 프로토타입과 같다', () => {
    const byWho = (who: KnobWho) => KNOB_IDS.filter((id) => KNOB_META[id].who === who);
    expect(byWho('batter')).toEqual(['contact', 'power', 'eye', 'focus', 'speed']);
    expect(byWho('pitcher')).toEqual(['stuff', 'control', 'stamina', 'nerve']);
    expect(byWho('field')).toEqual(['defense']);
    expect(byWho('env')).toEqual(['carry', 'slick', 'glare']);
    expect(byWho('team')).toEqual(['mood']);
  });
});

describe('SUBJECTS_FOR', () => {
  it('손잡이 대상마다 고를 수 있는 Subject', () => {
    expect(SUBJECTS_FOR).toEqual({
      batter: ['batter', 'battingTeam', 'everyone'],
      pitcher: ['pitcher', 'fieldingTeam', 'everyone'],
      field: ['fieldingTeam', 'everyone'],
      env: ['everyone'],
      team: ['battingTeam', 'fieldingTeam'],
    });
  });
});

describe('SUBJECT_LABEL', () => {
  it('Subject의 한국어 라벨', () => {
    expect(SUBJECT_LABEL).toEqual({
      batter: '타자',
      pitcher: '투수',
      battingTeam: '공격팀',
      fieldingTeam: '수비팀',
      everyone: '모두',
    });
  });
});
