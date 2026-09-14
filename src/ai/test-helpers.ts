import { situationText } from '../domain/format';
import { fixtureAppData } from '../test/fixtures/appData';
import type { EvidenceData } from '../types/data';
import type { PromptContext } from '../types/domain';

/*
 * src/ai·api 테스트 전용 도우미. 합성 픽스처 장면(9회말 2사 만루, 홈타자6 대 원정투수)으로
 * PromptContext를 만든다. 실존 선수 이름을 쓰지 않는다(ADR-005).
 */

const scene = fixtureAppData.scenes[0];
const players = fixtureAppData.core.players;

export function fixtureContext(overrides: Partial<PromptContext> = {}): PromptContext {
  const batter = players[scene.batter];
  const pitcher = players[scene.pitcher];
  const batSide = scene.state.half === 0 ? 'away' : 'home';
  const fieldSide = batSide === 'away' ? 'home' : 'away';
  return {
    date: scene.date,
    stadium: scene.stadium,
    awayName: scene.away.name,
    homeName: scene.home.name,
    awayScore: scene.state.away,
    homeScore: scene.state.home,
    situation: situationText(scene.state),
    batter: { id: batter.id, name: batter.name, team: scene[batSide].name, bats: batter.bats ?? 'R' },
    pitcher: { id: pitcher.id, name: pitcher.name, team: scene[fieldSide].name, throws: pitcher.throws ?? 'R' },
    battingTeam: scene[batSide].name,
    fieldingTeam: scene[fieldSide].name,
    lineupNames: [...scene.lineups.away, ...scene.lineups.home].map((id) => players[id].name),
    weather: { ...scene.context },
    ...overrides,
  };
}

/** 픽스처 evidence(temp_c maybe, day_game useless)의 깊은 복사본 */
export function fixtureEvidence(): EvidenceData {
  if (!fixtureAppData.evidence) throw new Error('픽스처 evidence가 없다');
  return JSON.parse(JSON.stringify(fixtureAppData.evidence)) as EvidenceData;
}
