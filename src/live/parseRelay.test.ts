import { describe, expect, it } from 'vitest';
import { fixtureNaverLivePayload, fixtureNaverRelay, fixtureNaverSchedule } from '../test/fixtures/naverRelay';
import { latestInning, lineupsAt, localRelayPayloads, parseRelay, plateAppearances, substitutions, summaryFromSchedule } from './relay';
import { isGameSummary, isLiveGame } from './validate';

/*
 * 원자료 → LiveGame 전체 흐름. 합성 데이터만 쓴다(공개 저장소).
 * 실제 140경기와의 대조는 `npm run check:relay`가 한다.
 */

describe('summaryFromSchedule', () => {
  const games = fixtureNaverSchedule();

  it('계약을 지키는 GameSummary를 만든다', () => {
    for (const g of games) expect(isGameSummary(summaryFromSchedule(g))).toBe(true);
  });

  it('statusCode를 앱 상태로 옮긴다', () => {
    expect(games.map((g) => summaryFromSchedule(g).status)).toEqual(['before', 'live', 'final', 'cancelled']);
  });

  it('경기 전·취소는 점수가 null이다', () => {
    const before = summaryFromSchedule(games[0]);
    expect([before.away.score, before.home.score]).toEqual([null, null]);
    expect(summaryFromSchedule(games[3]).home.score).toBeNull();
  });

  it('끝난 경기는 점수가 숫자다', () => {
    const final = summaryFromSchedule(games[2]);
    expect([final.away.score, final.home.score]).toEqual([4, 7]);
  });

  it('이닝 표시는 진행 중일 때만 남긴다', () => {
    expect(summaryFromSchedule(games[1]).inningText).toBe('3회초');
    expect(summaryFromSchedule(games[2]).inningText).toBeNull();
  });

  it('시각은 gameDateTime에서 HH:MM으로 자른다', () => {
    expect(summaryFromSchedule(games[0]).time).toBe('18:30');
  });
});

describe('parseRelay', () => {
  const raw = fixtureNaverRelay();
  const summary = summaryFromSchedule(fixtureNaverSchedule()[1]);
  const game = parseRelay({ summary, payloads: localRelayPayloads(raw) });

  it('계약을 지키는 LiveGame을 만든다', () => {
    expect(isLiveGame(game)).toBe(true);
  });

  it('타석 번호는 1부터 오름차순이다', () => {
    expect(game.plateAppearances.map((pa) => pa.no)).toEqual(
      game.plateAppearances.map((_, i) => i + 1),
    );
  });

  it('타선 아홉 칸이 모두 확정된 타석만 남는다', () => {
    expect(game.plateAppearances.length).toBeGreaterThan(0);
    for (const pa of game.plateAppearances) {
      expect(pa.lineups.away).toHaveLength(9);
      expect(pa.lineups.home).toHaveLength(9);
      expect(pa.lineups.away.every(Boolean)).toBe(true);
    }
  });

  it('이름을 중계에서 모은다', () => {
    expect(game.names.a1).toBe('김타자1');
    expect(game.names.h1).toBe('이타자1');
  });

  it('투타 표기에서 타격 손을 읽는다', () => {
    expect(game.hands.a1?.bats).toBe('L');
    expect(game.hands.a2?.bats).toBe('R');
    expect(game.hands.a3?.bats).toBe('S');
  });

  it('실시간 응답이면 머리 필드에서 진행 중 타석을 만든다', () => {
    const live = parseRelay({ summary, payloads: [fixtureNaverLivePayload()] });
    expect(live.current).not.toBeNull();
    expect(live.current!.batter).toBe('h2');
    expect(live.current!.pitcher).toBe('ap1');
    expect(live.current!.balls).toBe(2);
    expect(live.current!.strikes).toBe(1);
    expect(live.current!.state.inning).toBe(2);
    expect(live.current!.state.half).toBe(1);
  });

  it('로컬 원자료에는 진행 중 타석이 없다', () => {
    // localRelayPayloads는 머리 필드를 비운다. 지난 경기 파일에는 "지금"이 없다
    expect(game.current).toBeNull();
  });

  it('끝난 경기에는 진행 중 타석이 없다', () => {
    const finished = parseRelay({
      summary: summaryFromSchedule(fixtureNaverSchedule()[2]),
      payloads: localRelayPayloads(raw),
    });
    expect(finished.current).toBeNull();
  });

  it('이닝마다 따로 받은 응답을 no로 합친다', () => {
    const split = [
      { inn: 1, textRelays: raw.textRelays.filter((r) => r.inn === 1) },
      { inn: 2, textRelays: raw.textRelays.filter((r) => r.inn === 2) },
      // 같은 이닝을 다시 받아도 중복되지 않는다
      { inn: 2, textRelays: raw.textRelays.filter((r) => r.inn === 2) },
    ];
    const merged = parseRelay({ summary, payloads: split });
    expect(merged.plateAppearances).toHaveLength(game.plateAppearances.length);
  });

  it('결과가 없는 타석은 complete false이고 event가 null이다', () => {
    const broken = game.plateAppearances.filter((pa) => !pa.complete);
    expect(broken.length).toBeGreaterThan(0);
    for (const pa of broken) expect(pa.event).toBeNull();
  });
});

describe('lineupsAt', () => {
  const raw = fixtureNaverRelay();
  const payload = { textRelays: raw.textRelays };
  const pas = plateAppearances(payload);
  const subs = substitutions(payload);

  it('대타 교체를 찾는다', () => {
    expect(subs.some((s) => s.kind === 'pinch_hitter')).toBe(true);
  });

  it('교체 전 타석에는 나간 선수가, 교체 뒤 타석에는 들어온 선수가 있다', () => {
    const sub = subs.find((s) => s.kind === 'pinch_hitter')!;
    const before = pas.filter((pa) => pa.playSeq < sub.seq).at(-1)!;
    const after = pas.filter((pa) => pa.playSeq > sub.seq)[0]!;
    expect(lineupsAt(pas, subs, before)[sub.side][sub.slot! - 1]).toBe(sub.outId);
    expect(lineupsAt(pas, subs, after)[sub.side][sub.slot! - 1]).toBe(sub.inId);
  });

  it('대상 타석의 타자는 자기 타순에 있다', () => {
    for (const pa of pas) {
      const lineups = lineupsAt(pas, subs, pa);
      expect(lineups[pa.side][pa.batOrder - 1]).toBe(pa.batterId);
    }
  });
});

describe('latestInning', () => {
  it('중계 응답의 현재 이닝을 읽는다', () => {
    expect(latestInning({ inn: 7 })).toBe(7);
  });

  it('없으면 0이다', () => {
    expect(latestInning({})).toBe(0);
    expect(latestInning(null)).toBe(0);
  });
});
