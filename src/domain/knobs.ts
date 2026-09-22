import type { KnobId, KnobWho, Subject } from '../types/domain.js';

/** 손잡이 14개 (프로토타입 engine.js KNOBS 순서) */
export const KNOB_IDS: readonly KnobId[] = [
  'contact', 'power', 'eye', 'focus', 'speed',
  'stuff', 'control', 'stamina', 'nerve',
  'defense', 'carry', 'slick', 'glare', 'mood',
];

/** label은 engine.js, hint(세기가 양수일 때의 뜻)는 app.js KNOB_HINT */
export const KNOB_META: Record<KnobId, { label: string; who: KnobWho; hint: string }> = {
  contact: { label: '컨택', who: 'batter', hint: '공을 더 잘 맞힘, 삼진 감소' },
  power: { label: '파워', who: 'batter', hint: '장타·홈런 증가' },
  eye: { label: '선구안', who: 'batter', hint: '볼넷 증가, 삼진 감소' },
  focus: { label: '집중력', who: 'batter', hint: '타자에게 전반적으로 유리' },
  speed: { label: '주력', who: 'batter', hint: '내야안타·3루타 증가' },
  stuff: { label: '구위', who: 'pitcher', hint: '삼진 증가, 피안타 감소' },
  control: { label: '제구', who: 'pitcher', hint: '볼넷 감소' },
  stamina: { label: '체력', who: 'pitcher', hint: '피안타·볼넷 감소' },
  nerve: { label: '멘탈', who: 'pitcher', hint: '위기에서 볼넷·홈런 감소' },
  defense: { label: '수비', who: 'field', hint: '안타가 아웃으로 바뀜' },
  carry: { label: '타구 비거리', who: 'env', hint: '홈런·장타 증가 (바람·기온)' },
  slick: { label: '미끄러운 공', who: 'env', hint: '볼넷 증가, 삼진 감소 (비·습도·땀)' },
  glare: { label: '시야 방해', who: 'env', hint: '타자가 공을 보기 어려워 삼진 증가' },
  mood: { label: '팀 분위기', who: 'team', hint: '그 팀에 전반적으로 유리' },
};

/** 손잡이 대상(who)마다 해석 결과가 고를 수 있는 Subject */
export const SUBJECTS_FOR: Record<KnobWho, readonly Subject[]> = {
  batter: ['batter', 'battingTeam', 'everyone'],
  pitcher: ['pitcher', 'fieldingTeam', 'everyone'],
  field: ['fieldingTeam', 'everyone'],
  env: ['everyone'],
  team: ['battingTeam', 'fieldingTeam'],
};

export const SUBJECT_LABEL: Record<Subject, string> = {
  batter: '타자',
  pitcher: '투수',
  battingTeam: '공격팀',
  fieldingTeam: '수비팀',
  everyone: '모두',
};
