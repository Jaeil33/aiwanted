import { describe, expect, it } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame } from '../test/fixtures/live';
import type { LiveGame } from '../types/live';
import { gamesByDate, gamesOfTeam, halfBlocks, paList } from './paList';

/*
 * 경기 목록·타석 목록 화면의 파생 값(ADR-032). 순수 함수라 화면 없이 검사한다.
 */

const GAME = fixtureLiveGame();
const SUMMARIES = fixtureGameSummaries();

describe('paList', () => {
  const rows = paList(GAME);

  it('타석마다 한 줄, 번호는 그대로다', () => {
    expect(rows.map((r) => r.no)).toEqual(GAME.plateAppearances.map((pa) => pa.no));
  });

  it('이닝·상황을 글로 적는다', () => {
    expect(rows[0]).toMatchObject({ inningText: '1회초', situationText: '무사 주자 없음' });
    expect(rows[5]).toMatchObject({ inningText: '1회말' });
    expect(rows[4].situationText).toBe('1사 1루');
  });

  it('이름은 중계에서 모은 이름, 없으면 id다', () => {
    expect(rows[0].batter).toBe('김타자1');
    expect(rows[0].pitcher).toBe('최투수');
    const noNames: LiveGame = { ...GAME, names: {} };
    expect(paList(noNames)[0].batter).toBe('a1');
  });

  it('타석 직전 점수를 담는다', () => {
    expect(rows[0].score).toEqual({ away: 0, home: 0 });
    expect(rows[3].score).toEqual({ away: 2, home: 0 });
  });

  it('실제 결과 문장은 담지 않는다', () => {
    // 목록에서 결과를 보여 주면 되돌려볼 재미가 없다. 결과는 결과 화면에서만 본다
    expect(JSON.stringify(rows)).not.toContain('홈런');
    expect(JSON.stringify(rows)).not.toContain('삼진');
  });

  it('끊긴 타석은 비교할 실제 결과가 없다고 표시한다', () => {
    expect(rows[7].hasActual).toBe(false);
    expect(rows[0].hasActual).toBe(true);
  });

  it('승부처를 고르되 흔들린 폭은 숫자로 내보내지 않는다', () => {
    // ADR-014: 실제 |WPA|는 고르기에만 쓰고 화면에 보여 주지 않는다
    const picked = paList(GAME, { highlights: 2 }).filter((r) => r.highlight);
    expect(picked).toHaveLength(2);
    // 홈런 타석(0.49 → 0.27, 22%p)이 가장 크게 흔들렸다
    expect(picked.map((r) => r.no)).toContain(3);
    for (const row of picked) expect(Object.keys(row)).not.toContain('swingPp');
  });

  it('승리확률을 모르면 승부처로 고르지 않는다', () => {
    const noWp: LiveGame = {
      ...GAME,
      plateAppearances: GAME.plateAppearances.map((pa) => ({ ...pa, wpBeforeHome: null, wpAfterHome: null })),
    };
    expect(paList(noWp, { highlights: 3 }).every((r) => !r.highlight)).toBe(true);
  });

  it('highlights를 안 주면 아무것도 고르지 않는다', () => {
    expect(rows.every((r) => !r.highlight)).toBe(true);
  });

  it('타석이 없으면 빈 목록이다', () => {
    expect(paList({ ...GAME, plateAppearances: [] })).toEqual([]);
  });
});

describe('halfBlocks', () => {
  it('반이닝마다 묶는다', () => {
    const blocks = halfBlocks(paList(GAME));
    expect(blocks.map((b) => b.inningText)).toEqual(['1회초', '1회말']);
    expect(blocks[0].rows).toHaveLength(5);
    expect(blocks[1].rows).toHaveLength(3);
  });

  it('빈 목록이면 빈 묶음이다', () => {
    expect(halfBlocks([])).toEqual([]);
  });
});

describe('gamesOfTeam', () => {
  it('그 팀이 나온 경기만 고른다', () => {
    expect(gamesOfTeam(SUMMARIES, 'LG').map((g) => g.gameId)).toEqual(['20260915LGOB02026']);
    expect(gamesOfTeam(SUMMARIES, 'KT').map((g) => g.gameId)).toEqual(['20260914NCKT02026']);
  });

  it('팀이 null이면 전부 그대로', () => {
    expect(gamesOfTeam(SUMMARIES, null)).toEqual(SUMMARIES);
  });
});

describe('gamesByDate', () => {
  it('날짜마다 묶고 최근이 먼저다', () => {
    const groups = gamesByDate(SUMMARIES);
    expect(groups.map((g) => g.date)).toEqual(['2026-09-15', '2026-09-14']);
    expect(groups[0].games).toHaveLength(2);
  });

  it('같은 날 안에서는 시작 시각 순이다', () => {
    const late = { ...SUMMARIES[0], gameId: '20260915WOLT02026', time: '18:30' };
    const early = { ...SUMMARIES[1], gameId: '20260915SSHH02026', time: '14:00' };
    const groups = gamesByDate([late, early]);
    expect(groups[0].games.map((g) => g.time)).toEqual(['14:00', '18:30']);
  });
});
