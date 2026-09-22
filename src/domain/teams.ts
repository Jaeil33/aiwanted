import type { TeamCode } from '../types/data.js';

/** KBO 10개 구단. 색은 docs/UI_GUIDE.md 팀 컬러 */
export const TEAMS: Record<TeamCode, { name: string; color: string }> = {
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
};

export function isTeamCode(x: string): x is TeamCode {
  return Object.hasOwn(TEAMS, x);
}
