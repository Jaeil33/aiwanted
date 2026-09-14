import { describe, expect, it } from 'vitest';
import { startNextHalf } from '../engine';
import { fixtureAppData } from '../test/fixtures/appData';
import type { AppData, PlayerRecord, SceneRecord } from '../types/data';
import { batterFor, batterStanceFor, buildSceneSetup, pitcherFor } from './scene';

const ONE = [1, 1, 1, 1, 1, 1, 1];
const SCENE = fixtureAppData.scenes[0];
const setup = buildSceneSetup(fixtureAppData, SCENE.id);
/** 장면 반이닝(9회말)이 3아웃으로 끝난 뒤: 10회초, 원정 타순 3(a4)부터 */
const TENTH_TOP = startNextHalf({ ...SCENE.state, outs: 3, bases: 0 });

describe('buildSceneSetup', () => {
  it('장면·리그 분포·카운트 표를 싣는다', () => {
    expect(setup.scene).toBe(SCENE);
    expect(setup.lg).toEqual(fixtureAppData.core.league);
    expect(setup.countTable).toEqual(fixtureAppData.core.countTable);
  });

  it('타선은 장면 lineups 순서의 선수 id·rel, 불펜은 팀 코드의 합성 선수, 장면 투수는 선수 rel이다', () => {
    expect(setup.away.lineup.map((slot) => slot.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9']);
    expect(setup.home.lineup.map((slot) => slot.id)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9']);
    expect(setup.away.lineup[2]).toEqual({ id: 'a3', rel: [0.8, 1, 0.9, 1, 1, 1.15, 0.97] });
    expect(setup.home.lineup[5]).toEqual({ id: 'h6', rel: [0.9, 1, 1.6, 1, 1.2, 1, 0.95] });
    expect(setup.away.bullpen).toEqual({ id: 'HT-pen', rel: ONE });
    expect(setup.home.bullpen).toEqual({ id: 'LT-pen', rel: ONE });
    expect(setup.scenePitcher).toEqual({ id: 'ap', rel: [1.15, 0.9, 0.85, 1, 0.95, 0.95, 1] });
  });

  it('말 공격 장면이면 홈이 공격·원정이 수비이고, 장면 기준 타자·투수·진영을 담는다', () => {
    expect(setup.batSide).toBe('home');
    expect(setup.fieldSide).toBe('away');
    expect(setup.sceneContext).toEqual({ batterId: 'h6', pitcherId: 'ap', batSide: 'home' });
  });

  it('AI 프롬프트용 장면 설명을 만든다', () => {
    expect(setup.promptContext).toEqual({
      date: '2026-08-15',
      stadium: '픽스처 구장',
      awayName: 'KIA',
      homeName: '롯데',
      awayScore: 4,
      homeScore: 4,
      situation: '9회말 2사 만루',
      batter: { id: 'h6', name: '홈타자6', team: '롯데', bats: 'L' },
      pitcher: { id: 'ap', name: '원정투수', team: 'KIA', throws: 'R' },
      battingTeam: '롯데',
      fieldingTeam: 'KIA',
      lineupNames: [
        ...Array.from({ length: 9 }, (_, i) => `원정타자${i + 1}`),
        ...Array.from({ length: 9 }, (_, i) => `홈타자${i + 1}`),
      ],
      weather: { tempC: 27.5, windMs: 2.1, dayGame: false, dome: false },
    });
  });

  it('선수 id·불펜 id → 이름 표와 두 팀 색을 만든다', () => {
    expect(setup.names.h6).toBe('홈타자6');
    expect(setup.names.a1).toBe('원정타자1');
    expect(setup.names.ap).toBe('원정투수');
    expect(setup.names.hp).toBe('홈투수');
    expect(setup.names['HT-pen']).toBe('KIA 불펜');
    expect(setup.names['LT-pen']).toBe('롯데 불펜');
    expect(setup.teamColors).toEqual({ away: '#F0474B', home: '#5C8DF6' });
  });

  it('선수 기록·불펜·손 기록이 없으면 rel 1 벡터, <팀>-pen, id 이름, 우타·우투로 채운다', () => {
    const players: Record<string, PlayerRecord> = {
      ...fixtureAppData.core.players,
      h6: { ...fixtureAppData.core.players.h6, bats: undefined },
    };
    delete players.a7;
    delete players.ap;
    const data: AppData = {
      ...fixtureAppData,
      core: { ...fixtureAppData.core, players, bullpens: { HT: fixtureAppData.core.bullpens.HT } },
    };
    const s = buildSceneSetup(data, SCENE.id);
    expect(s.away.lineup[6]).toEqual({ id: 'a7', rel: ONE });
    expect(s.scenePitcher).toEqual({ id: 'ap', rel: ONE });
    expect(s.home.bullpen).toEqual({ id: 'LT-pen', rel: ONE });
    expect(s.away.bullpen).toEqual({ id: 'HT-pen', rel: ONE });
    expect(s.names['LT-pen']).toBe('롯데 불펜');
    expect(s.names.a7).toBe('a7');
    expect(s.promptContext.batter.bats).toBe('R');
    expect(s.promptContext.pitcher).toEqual({ id: 'ap', name: 'ap', team: 'KIA', throws: 'R' });
    expect(batterFor(s, SCENE.state).stance).toBe('R');
    expect(fixtureAppData.core.players.a7).toBeDefined();
  });

  it('모르는 장면 id면 Error', () => {
    expect(() => buildSceneSetup(fixtureAppData, 'no-such-scene')).toThrow(Error);
  });
});

describe('batterStanceFor', () => {
  it('좌·우타는 그대로, 스위치 타자는 투수와 반대 손, 기록이 없으면 우타', () => {
    expect(batterStanceFor('L', 'R')).toBe('L');
    expect(batterStanceFor('R', 'L')).toBe('R');
    expect(batterStanceFor('S', 'R')).toBe('L');
    expect(batterStanceFor('S', 'L')).toBe('R');
    expect(batterStanceFor(undefined, 'L')).toBe('R');
    expect(batterStanceFor(undefined, 'R')).toBe('R');
  });
});

describe('pitcherFor', () => {
  it('장면과 같은 이닝·초말이면 장면 투수다', () => {
    expect(pitcherFor(setup, SCENE.state)).toBe(setup.scenePitcher);
    expect(pitcherFor(setup, { ...SCENE.state, outs: 0, bases: 0, home: 5, slotHome: 7 })).toBe(setup.scenePitcher);
  });

  it('이닝이나 초말이 다르면 수비 팀 불펜이 던진다', () => {
    expect(TENTH_TOP).toMatchObject({ inning: 10, half: 0, outs: 0, bases: 0 });
    expect(pitcherFor(setup, TENTH_TOP)).toBe(setup.home.bullpen);
    expect(pitcherFor(setup, startNextHalf({ ...TENTH_TOP, outs: 3 }))).toBe(setup.away.bullpen);
    expect(pitcherFor(setup, { ...SCENE.state, half: 0 })).toBe(setup.home.bullpen);
    expect(pitcherFor(setup, { ...SCENE.state, inning: 8 })).toBe(setup.away.bullpen);
  });
});

describe('batterFor', () => {
  it('그 상태 공격 팀 타순의 타자와 이름·타석 방향', () => {
    expect(batterFor(setup, SCENE.state)).toEqual({
      id: 'h6',
      rel: [0.9, 1, 1.6, 1, 1.2, 1, 0.95],
      name: '홈타자6',
      stance: 'L',
    });
    expect(batterFor(setup, TENTH_TOP)).toMatchObject({ id: 'a4', name: '원정타자4', stance: 'R' });
  });

  it('스위치 타자는 그 상태에서 던지는 투수의 손을 따른다', () => {
    // h7(스위치) vs 장면 투수 ap(우투) → 좌타석
    expect(batterFor(setup, { ...SCENE.state, slotHome: 6 })).toMatchObject({ id: 'h7', stance: 'L' });
    // a5(스위치) vs 손 기록이 없는 홈 불펜(우투로 본다) → 좌타석
    expect(batterFor(setup, { ...TENTH_TOP, slotAway: 4 })).toMatchObject({ id: 'a5', stance: 'L' });

    // 좌투 hp가 장면 투수인 초 공격 장면: a5 → 우타석
    const lefty: SceneRecord = {
      ...SCENE,
      id: 'fixture-lefty',
      batter: 'a5',
      pitcher: 'hp',
      state: { ...SCENE.state, half: 0, slotAway: 4 },
    };
    const s = buildSceneSetup({ ...fixtureAppData, scenes: [...fixtureAppData.scenes, lefty] }, lefty.id);
    expect(batterFor(s, lefty.state)).toMatchObject({ id: 'a5', stance: 'R' });
    expect(s.batSide).toBe('away');
    expect(s.promptContext.batter).toEqual({ id: 'a5', name: '원정타자5', team: 'KIA', bats: 'S' });
    expect(s.promptContext.pitcher).toEqual({ id: 'hp', name: '홈투수', team: '롯데', throws: 'L' });
  });
});
