import { describe, expect, it } from 'vitest';
import { situationText } from '../domain/format';
import { fixtureAppData } from '../test/fixtures/appData';
import { fixtureGameSummaries, fixtureLiveGame } from '../test/fixtures/live';
import type { LiveGame } from '../types/live';
import { buildSceneSetup } from './scene';
import { gameRowsOf, pitcherPlanOf } from './pitchers';
import { batterFor, buildSituationSetup, pitcherFor, situationFromPa, situationFromScene, situationTitle } from './situation';

/*
 * 지난 경기의 아무 타석이나 되돌려볼 수 있게 하는 조립(ADR-032·033). 합성 데이터만 쓴다.
 */

const CORE = fixtureAppData.core;
const GAME = fixtureLiveGame();

describe('situationFromPa', () => {
  it('모든 타석을 상황으로 바꾼다', () => {
    for (const pa of GAME.plateAppearances) {
      const situation = situationFromPa(GAME, pa.no, 'past');
      expect(situation).not.toBeNull();
      expect(situation!.id).toBe(`${GAME.summary.gameId}-${pa.no}`);
      expect(situation!.gameId).toBe(GAME.summary.gameId);
      expect(situation!.paNo).toBe(pa.no);
      expect(situation!.state).toEqual(pa.before);
      expect(situation!.batter).toBe(pa.batter);
      expect(situation!.pitcher).toBe(pa.pitcher);
      expect(situation!.lineups).toEqual(pa.lineups);
      // 되돌려보기는 언제나 0-0부터다(ADR-016)
      expect(situation!.count).toEqual({ balls: 0, strikes: 0 });
    }
  });

  it('없는 타석 번호면 null', () => {
    expect(situationFromPa(GAME, 0, 'past')).toBeNull();
    expect(situationFromPa(GAME, 99, 'past')).toBeNull();
  });

  it('실제 결과는 끝난 타석에만 담는다', () => {
    const homer = situationFromPa(GAME, 3, 'past')!;
    expect(homer.actual).toEqual({
      result: '김타자3 : 좌월 2점 홈런',
      event: 2,
      runs: 2,
      pitches: GAME.plateAppearances[2].pitches,
      wpAfterHome: 0.27,
    });
    // 주루사로 끊긴 타석은 되돌려볼 결과가 없다
    const broken = situationFromPa(GAME, 8, 'past')!;
    expect(GAME.plateAppearances[7].complete).toBe(false);
    expect(broken.actual).toBeNull();
  });

  it('교체 뒤 타석은 바뀐 타선을 쓴다', () => {
    const pinch = situationFromPa(GAME, 7, 'past')!;
    expect(pinch.batter).toBe('ph1');
    expect(pinch.lineups.home[1]).toBe('ph1');
  });

  it('반이닝이 넘어간 타석은 half 1이다', () => {
    expect(situationFromPa(GAME, 5, 'past')!.state.half).toBe(0);
    expect(situationFromPa(GAME, 6, 'past')!.state.half).toBe(1);
  });

  it('kind를 그대로 담는다', () => {
    expect(situationFromPa(GAME, 1, 'live')!.kind).toBe('live');
    expect(situationFromPa(GAME, 1, 'past')!.kind).toBe('past');
  });

  it('날짜·구장·팀은 경기 요약에서 온다', () => {
    const s = situationFromPa(GAME, 1, 'past')!;
    expect(s.date).toBe('2026-09-15');
    expect(s.stadium).toBe('잠실');
    expect(s.away).toEqual({ code: 'LG', name: 'LG' });
    expect(s.home).toEqual({ code: 'OB', name: '두산' });
  });

  it('낮 경기는 시작이 17:00 이전, 돔은 고척이다', () => {
    const night = situationFromPa(GAME, 1, 'past')!;
    expect(night.context.dayGame).toBe(false);
    expect(night.context.dome).toBe(false);

    const day: LiveGame = { ...GAME, summary: { ...GAME.summary, time: '14:00', stadium: '고척' } };
    const s = situationFromPa(day, 1, 'past')!;
    expect(s.context.dayGame).toBe(true);
    expect(s.context.dome).toBe(true);
  });

  it('네이버 승리확률은 타석 직전 값이다', () => {
    expect(situationFromPa(GAME, 3, 'past')!.naverWpBeforeHome).toBe(0.49);
  });

  it('구장을 모르면 null', () => {
    const noStadium: LiveGame = { ...GAME, summary: { ...GAME.summary, stadium: '' } };
    expect(situationFromPa(noStadium, 1, 'past')!.stadium).toBeNull();
  });
});

describe('situationTitle', () => {
  it('상황 문구 그대로다', () => {
    const situation = situationFromPa(GAME, 1, 'past')!;
    expect(situationTitle(situation)).toBe(situationText(situation.state));
  });

  it('11회면 마지막 이닝을 붙인다', () => {
    const base = situationFromPa(GAME, 1, 'past')!;
    const eleventh = { ...base, state: { ...base.state, inning: 11 } };
    expect(situationTitle(eleventh)).toBe(`${situationText(eleventh.state)}, 마지막 이닝`);
  });

  it('대타처럼 교체 기록이 있어야 아는 꼬리표는 짐작하지 않는다', () => {
    // ADR-014: 기록으로 확인되는 것만 붙인다. 아는 쪽이 extra.title로 넘긴다
    const pinch = situationFromPa(GAME, 7, 'past')!;
    expect(situationTitle(pinch)).not.toContain('대타');
    expect(buildSituationSetup(CORE, pinch, { title: '1회말 1사 1루, 대타' }).title).toBe('1회말 1사 1루, 대타');
  });
});

describe('buildSituationSetup', () => {
  const scene = fixtureAppData.scenes[0];

  it('장면으로 만든 설정이 buildSceneSetup과 같다', () => {
    // 옛 경로와 새 경로가 같은 엔진 설정을 내야 화면·확률이 그대로다
    const fromScene = buildSceneSetup(fixtureAppData, scene.id);
    const direct = buildSituationSetup(CORE, situationFromScene(scene), {
      actualFinal: { away: scene.away.final, home: scene.home.final },
    });
    expect(direct.away).toEqual(fromScene.away);
    expect(direct.home).toEqual(fromScene.home);
    expect(direct.scenePitcher).toEqual(fromScene.scenePitcher);
    expect(direct.batSide).toBe(fromScene.batSide);
    expect(direct.fieldSide).toBe(fromScene.fieldSide);
    expect(direct.sceneContext).toEqual(fromScene.sceneContext);
    expect(direct.promptContext).toEqual(fromScene.promptContext);
    expect(direct.teamColors).toEqual(fromScene.teamColors);
    expect(direct.lg).toEqual(fromScene.lg);
  });

  it('장면 제목·최종 점수를 담는다', () => {
    const setup = buildSceneSetup(fixtureAppData, scene.id);
    expect(setup.title).toBe(scene.title);
    expect(setup.actualFinal).toEqual({ away: scene.away.final, home: scene.home.final });
  });

  it('기록이 없는 선수는 rel 1(리그 평균)이다', () => {
    const situation = situationFromPa(GAME, 1, 'past')!;
    const setup = buildSituationSetup(CORE, situation);
    // ap1·hp1·ph1은 픽스처 core에 없다
    expect(setup.scenePitcher.id).toBe('hp1');
    expect([...setup.scenePitcher.rel]).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('core에 있는 타자는 core rel을 쓴다', () => {
    const situation = situationFromPa(GAME, 1, 'past')!;
    const setup = buildSituationSetup(CORE, situation);
    expect(setup.away.lineup.map((slot) => slot.id)).toEqual(GAME.plateAppearances[0].lineups.away);
    expect([...setup.away.lineup[2].rel]).toEqual(CORE.players.a3.rel);
  });

  it('중계에서 모은 이름·손을 core에 없는 선수에 채운다', () => {
    const situation = situationFromPa(GAME, 7, 'past')!;
    const setup = buildSituationSetup(CORE, situation, { names: GAME.names, hands: GAME.hands });
    expect(setup.names.ph1).toBe('정대타');
    expect(setup.hands.ph1?.bats).toBe('L');
    expect(setup.hands.hp1?.throws).toBe('L');
  });

  it('core 이름이 중계 이름보다 앞선다', () => {
    const situation = situationFromPa(GAME, 1, 'past')!;
    const setup = buildSituationSetup(CORE, situation, { names: { a1: '다른이름' } });
    expect(setup.names.a1).toBe(CORE.players.a1.name);
  });

  it('이름을 아예 모르면 id를 쓴다', () => {
    const situation = situationFromPa(GAME, 1, 'past')!;
    const setup = buildSituationSetup(CORE, situation);
    expect(setup.names.hp1).toBe('hp1');
  });

  it('투타 겸업 선수의 이름·손은 꼬리 없는 id에 놓인다', () => {
    // core.players의 키는 투수 <id>, 타자 <id>:H다(ADR-035). 화면은 꼬리 없는 id로만 찾는다
    const dual = {
      ...CORE,
      players: {
        ...CORE.players,
        x9: { id: 'x9', name: '한겸업', team: 'HT' as const, kind: 'P' as const, throws: 'R' as const, rel: [1, 1, 1, 1, 1, 1, 1], line: {} },
        'x9:H': { id: 'x9', name: '한겸업', team: 'HT' as const, kind: 'H' as const, bats: 'L' as const, rel: [1, 1, 1, 1, 1, 1, 1], line: {} },
      },
    };
    const situation = situationFromPa(GAME, 1, 'past')!;
    const setup = buildSituationSetup(dual, situation);
    expect(setup.names.x9).toBe('한겸업');
    expect(setup.hands.x9).toEqual({ bats: 'L', throws: 'R' });
    expect(setup.names['x9:H']).toBeUndefined();
  });

  it('상황 볼카운트가 0-0이 아니면 프롬프트 맥락에 적는다', () => {
    const situation = { ...situationFromPa(GAME, 1, 'past')!, count: { balls: 1, strikes: 2 } };
    const setup = buildSituationSetup(CORE, situation);
    expect(setup.promptContext.situation).toContain('1볼 2스트라이크');
  });

  it('모르는 팀 코드도 무너지지 않는다', () => {
    const situation = { ...situationFromPa(GAME, 1, 'past')!, away: { code: 'ZZ' as never, name: '어딘가' } };
    const setup = buildSituationSetup(CORE, situation);
    expect(setup.teamColors.away).toBeTruthy();
    expect(setup.promptContext.awayName).toBe('어딘가');
  });
});

describe('batterFor·pitcherFor', () => {
  const situation = situationFromPa(GAME, 1, 'past')!;
  const setup = buildSituationSetup(CORE, situation, { names: GAME.names, hands: GAME.hands });

  it('상황 반이닝은 상황 투수가 던지고 다음 반이닝은 불펜이다', () => {
    expect(pitcherFor(setup, situation.state).id).toBe('hp1');
    expect(pitcherFor(setup, { ...situation.state, half: 1 }).id).toBe(setup.away.bullpen.id);
    expect(pitcherFor(setup, { ...situation.state, inning: 2 }).id).toBe(setup.home.bullpen.id);
  });

  it('타순 칸의 타자를 고른다', () => {
    expect(batterFor(setup, situation.state).id).toBe('a1');
    expect(batterFor(setup, { ...situation.state, slotAway: 4 }).id).toBe('a5');
  });

  it('스위치 타자는 투수 반대 손으로 선다', () => {
    // core의 a5는 양타, 상황 투수 hp1은 중계 기록으로 좌투 → 우타석
    expect(CORE.players.a5.bats).toBe('S');
    expect(setup.hands.hp1?.throws).toBe('L');
    expect(batterFor(setup, { ...situation.state, slotAway: 4 }).stance).toBe('R');
    // core의 a2는 좌타
    expect(CORE.players.a2.bats).toBe('L');
    expect(batterFor(setup, { ...situation.state, slotAway: 1 }).stance).toBe('L');
  });
});

describe('실제 투수 차례(ADR-033)', () => {
  const situation = situationFromPa(GAME, 1, 'past')!;
  const extra = { names: GAME.names, hands: GAME.hands, pitcherPlan: pitcherPlanOf(GAME), gameRows: gameRowsOf(GAME) };
  const setup = buildSituationSetup(CORE, situation, extra);

  it('상황 반이닝은 여전히 상황 투수가 끝까지 던진다', () => {
    expect(pitcherFor(setup, situation.state).id).toBe('hp1');
    expect(pitcherFor(setup, { ...situation.state, outs: 2 }).id).toBe('hp1');
  });

  it('다음 반이닝은 팀 불펜이 아니라 실제로 던진 투수다', () => {
    const bottom = { ...situation.state, half: 1 as const };
    expect(pitcherFor(setup, bottom).id).toBe('ap1');
    expect(pitcherFor(setup, bottom).id).not.toBe(setup.away.bullpen.id);
  });

  it('차례를 모르는 반이닝은 팀 불펜으로 떨어진다', () => {
    const noPlan = buildSituationSetup(CORE, situation, { names: GAME.names, hands: GAME.hands });
    expect(pitcherFor(noPlan, { ...situation.state, half: 1 }).id).toBe(noPlan.away.bullpen.id);
  });

  it('실제 경기보다 뒤 이닝이면 마지막 투수가 계속 던진다', () => {
    expect(pitcherFor(setup, { ...situation.state, inning: 12, half: 1 }).id).toBe('ap1');
    expect(pitcherFor(setup, { ...situation.state, inning: 12, half: 0 }).id).toBe('hp1');
  });

  it('차례에 나오는 투수의 rel을 미리 찾아 둔다', () => {
    // pitcherFor는 core를 받지 않는다. 조립할 때 한 번만 찾는다
    expect(Object.keys(setup.pitcherSlots).sort()).toEqual(['ap1', 'hp1']);
    expect([...setup.pitcherSlots.ap1.rel]).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('그 경기의 투구 표본을 싣는다', () => {
    expect(setup.gameRows.hp1.length).toBeGreaterThan(0);
    expect(buildSituationSetup(CORE, situation).gameRows).toEqual({});
  });
});

describe('situationFromScene', () => {
  it('장면을 상황 계약으로 옮긴다', () => {
    const scene = fixtureAppData.scenes[0];
    const situation = situationFromScene(scene);
    expect(situation.id).toBe(scene.id);
    expect(situation.kind).toBe('past');
    expect(situation.state).toEqual(scene.state);
    expect(situation.lineups).toEqual(scene.lineups);
    expect(situation.count).toEqual({ balls: 0, strikes: 0 });
    expect(situation.actual).toEqual({
      result: scene.actual.result,
      event: scene.actual.event,
      runs: scene.actual.runs,
      pitches: scene.actual.pitches,
      wpAfterHome: scene.actual.wpAfterHome,
    });
    expect(situation.context).toEqual(scene.context);
  });
});

describe('fixtureGameSummaries와 맞물린다', () => {
  it('경기 전 경기에는 타석이 없다', () => {
    const before: LiveGame = { ...GAME, summary: fixtureGameSummaries()[0], plateAppearances: [], current: null };
    expect(situationFromPa(before, 1, 'past')).toBeNull();
  });
});
