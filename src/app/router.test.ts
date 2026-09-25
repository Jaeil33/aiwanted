import { describe, expect, it } from 'vitest';
import { encodeShare, type SharePayload } from '../game';
import { formatRoute, parseHash, type Route } from './router';

const SHARE: SharePayload = {
  sceneId: 'fixture-walkoff',
  texts: ['오늘 폭염', '원정투수가 경기 전 짜장면 곱빼기를 먹었다'],
  mode: 'toon',
};

describe('parseHash', () => {
  it('해시가 없거나 #/면 첫 화면', () => {
    for (const hash of ['', '#', '#/']) expect(parseHash(hash), hash).toEqual({ screen: 'home' });
  });

  it('#/scene/:id는 장면 화면, 공유 값이 없으면 share null', () => {
    expect(parseHash('#/scene/fixture-walkoff')).toEqual({ screen: 'play', sceneId: 'fixture-walkoff', share: null });
  });

  it('?t=에 같은 장면의 공유 값이 있으면 읽는다', () => {
    expect(parseHash(`#/scene/fixture-walkoff?t=${encodeShare(SHARE)}`)).toEqual({
      screen: 'play',
      sceneId: 'fixture-walkoff',
      share: SHARE,
    });
  });

  it('공유 값이 틀렸거나 다른 장면의 것이면 share null', () => {
    const play = { screen: 'play', sceneId: 'fixture-walkoff', share: null };
    expect(parseHash('#/scene/fixture-walkoff?t=%%%')).toEqual(play);
    expect(parseHash('#/scene/fixture-walkoff?t=')).toEqual(play);
    expect(parseHash('#/scene/fixture-walkoff?x=1')).toEqual(play);
    expect(parseHash(`#/scene/fixture-walkoff?t=${encodeShare({ ...SHARE, sceneId: 'other' })}`)).toEqual(play);
  });

  it('#/teams는 팀 고르기', () => {
    expect(parseHash('#/teams')).toEqual({ screen: 'teams' });
  });

  it('#/team/:code는 그 팀 일정, ?m=으로 달을 고른다', () => {
    expect(parseHash('#/team/HH')).toEqual({ screen: 'team', code: 'HH', month: null });
    expect(parseHash('#/team/HH?m=2026-05')).toEqual({ screen: 'team', code: 'HH', month: '2026-05' });
  });

  it('모르는 팀 코드·이상한 달은 첫 화면·달 없음', () => {
    expect(parseHash('#/team/ZZ')).toEqual({ screen: 'home' });
    expect(parseHash('#/team/hh')).toEqual({ screen: 'home' });
    expect(parseHash('#/team/HH?m=2026-13')).toEqual({ screen: 'team', code: 'HH', month: null });
    expect(parseHash('#/team/HH?m=nope')).toEqual({ screen: 'team', code: 'HH', month: null });
  });

  it('#/game/:gameId는 타석 목록', () => {
    expect(parseHash('#/game/20260915LGOB02026')).toEqual({ screen: 'game', gameId: '20260915LGOB02026' });
    expect(parseHash('#/game/nope')).toEqual({ screen: 'home' });
  });

  it('#/pa/:gameId/:no는 그 타석', () => {
    expect(parseHash('#/pa/20260915LGOB02026/37')).toEqual({
      screen: 'pa', gameId: '20260915LGOB02026', no: 37, share: null,
    });
  });

  it('타석 번호가 1 이상 정수가 아니면 첫 화면', () => {
    for (const hash of ['#/pa/20260915LGOB02026/0', '#/pa/20260915LGOB02026/-1', '#/pa/20260915LGOB02026/x', '#/pa/20260915LGOB02026/1.5']) {
      expect(parseHash(hash), hash).toEqual({ screen: 'home' });
    }
  });

  it('타석 공유 값은 그 타석 id와 맞을 때만 읽는다', () => {
    const paShare: SharePayload = { ...SHARE, sceneId: '20260915LGOB02026-37' };
    expect(parseHash(`#/pa/20260915LGOB02026/37?t=${encodeShare(paShare)}`)).toEqual({
      screen: 'pa', gameId: '20260915LGOB02026', no: 37, share: paShare,
    });
    expect(parseHash(`#/pa/20260915LGOB02026/38?t=${encodeShare(paShare)}`)).toEqual({
      screen: 'pa', gameId: '20260915LGOB02026', no: 38, share: null,
    });
  });

  it('결과·판정소·만든 이유', () => {
    expect(parseHash('#/result')).toEqual({ screen: 'result' });
    expect(parseHash('#/evidence')).toEqual({ screen: 'evidence' });
    expect(parseHash('#/about')).toEqual({ screen: 'about' });
  });

  it('모르는 해시는 첫 화면', () => {
    for (const hash of ['#/nope', '#/scene', '#/scene/', '#/scene/a/b', '#/result/x', 'garbage', '#/scene/%E0%A4%A', '#/ABOUT']) {
      expect(parseHash(hash), hash).toEqual({ screen: 'home' });
    }
  });
});

describe('formatRoute — 시즌 경로', () => {
  it('왕복한다', () => {
    const routes: Route[] = [
      { screen: 'teams' },
      { screen: 'team', code: 'HH', month: null },
      { screen: 'team', code: 'HH', month: '2026-05' },
      { screen: 'game', gameId: '20260915LGOB02026' },
      { screen: 'pa', gameId: '20260915LGOB02026', no: 37, share: null },
      { screen: 'pa', gameId: '20260915LGOB02026', no: 37, share: { ...SHARE, sceneId: '20260915LGOB02026-37' } },
    ];
    for (const route of routes) expect(parseHash(formatRoute(route)), formatRoute(route)).toEqual(route);
  });
});

describe('formatRoute', () => {
  it('정해진 해시 문자열을 만든다', () => {
    expect(formatRoute({ screen: 'home' })).toBe('#/');
    expect(formatRoute({ screen: 'play', sceneId: 'fixture-walkoff', share: null })).toBe('#/scene/fixture-walkoff');
    expect(formatRoute({ screen: 'play', sceneId: 'fixture-walkoff', share: SHARE })).toBe(
      `#/scene/fixture-walkoff?t=${encodeShare(SHARE)}`,
    );
    expect(formatRoute({ screen: 'result' })).toBe('#/result');
    expect(formatRoute({ screen: 'evidence' })).toBe('#/evidence');
    expect(formatRoute({ screen: 'about' })).toBe('#/about');
  });

  it('모든 라우트가 parseHash와 왕복한다 (특수 문자가 든 장면 id 포함)', () => {
    const routes: Route[] = [
      { screen: 'home' },
      { screen: 'play', sceneId: 'fixture-walkoff', share: null },
      { screen: 'play', sceneId: 'fixture-walkoff', share: SHARE },
      { screen: 'play', sceneId: '장면 1/?#', share: null },
      { screen: 'play', sceneId: '장면 1/?#', share: { ...SHARE, sceneId: '장면 1/?#' } },
      { screen: 'result' },
      { screen: 'evidence' },
      { screen: 'about' },
    ];
    for (const route of routes) expect(parseHash(formatRoute(route)), JSON.stringify(route)).toEqual(route);
  });
});
