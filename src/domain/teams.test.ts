import { describe, expect, it } from 'vitest';
import { TEAMS, isTeamCode } from './teams';

describe('TEAMS', () => {
  it('KBO 10개 구단의 이름과 UI_GUIDE 팀 컬러', () => {
    expect(TEAMS).toEqual({
      HT: { name: 'KIA', color: '#F0474B' },
      LT: { name: '롯데', color: '#5C8DF6' },
      NC: { name: 'NC', color: '#86A8EE' },
      HH: { name: '한화', color: '#FF8A2A' },
      LG: { name: 'LG', color: '#E0457B' },
      OB: { name: '두산', color: '#A3A7EA' },
      SS: { name: '삼성', color: '#4C8FF7' },
      SK: { name: 'SSG', color: '#EF5261' },
      KT: { name: 'KT', color: '#D6D6D6' },
      WO: { name: '키움', color: '#C9566C' },
    });
  });
});

describe('isTeamCode', () => {
  it('TeamCode에만 true', () => {
    for (const code of Object.keys(TEAMS)) expect(isTeamCode(code)).toBe(true);
  });

  it('구단 이름·소문자·상속 속성은 TeamCode가 아니다', () => {
    for (const x of ['KIA', 'ht', '', 'XX', 'toString', '__proto__', 'constructor']) {
      expect(isTeamCode(x)).toBe(false);
    }
  });
});
