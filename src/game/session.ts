import type { Situation } from '../types/data';
import type { GameState, Half, Mode, PitchCode, PitchSample, Side, TmiEntry, VerdictResult } from '../types/domain';
import type { SituationExtra } from './situation';

export type Screen = 'home' | 'play' | 'result' | 'evidence' | 'about';

/** 끝난 타석 한 줄 (시간 순으로 쌓는다. 화면은 최신을 위에 그린다) */
export interface PlayLogEntry {
  index: number;
  inning: number;
  half: Half;
  batterName: string;
  pitcherName: string;
  headline: string;
  /** 타석 직후 점수 */
  score: { away: number; home: number };
  wpHomeAfter: number | null;
  highlight: boolean;
}

/** 다시 치르는 중인 상태 */
export interface LiveState {
  /** 지금 타석을 칠 상태 (반이닝이 끝났으면 다음 반이닝 시작 상태) */
  state: GameState;
  balls: number;
  strikes: number;
  /** 장면 첫 타석이 0 */
  paIndex: number;
  /** 이번 타석에 던진 공 (각 공의 카운트는 던지기 전) */
  pitches: PitchSample[];
}

export interface SessionState {
  screen: Screen;
  /** 열린 상황(되돌려보는 한 타석). 없으면 아무것도 열지 않았다 */
  situation: Situation | null;
  /** core에 기록이 없는 선수의 이름·손, 실제 최종 점수, 제목 */
  extra: SituationExtra;
  mode: Mode;
  /** 재생 난수 seed */
  seed: number;
  tmis: TmiEntry[];
  interpreting: boolean;
  /** 한 줄 알림 (AI 대체 경로 안내 등) */
  notice: string;
  /** AI 프로바이더를 더는 쓰지 않는다 (한 번 켜지면 유지) */
  providerDisabled: boolean;
  /** TmiEntry.id → 판정 */
  verdicts: Record<string, VerdictResult>;
  judgingId: string | null;
  live: LiveState | null;
  log: PlayLogEntry[];
  status: 'ready' | 'animating' | 'finished';
  final: { winner: Side | 'tie'; walkoff: boolean; state: GameState } | null;
}

export type SessionAction =
  | { type: 'navigate'; screen: Screen }
  | { type: 'openSituation'; situation: Situation; extra?: SituationExtra; seed: number; tmis?: TmiEntry[]; mode?: Mode }
  | { type: 'setMode'; mode: Mode }
  | { type: 'interpretStart' }
  | { type: 'interpretDone'; entry: TmiEntry; note: string; disableProvider: boolean }
  | { type: 'interpretFailed'; note: string }
  | { type: 'removeTmi'; id: string }
  | { type: 'judgeStart'; id: string }
  | { type: 'judgeDone'; id: string; verdict: VerdictResult; note: string; disableProvider: boolean }
  | { type: 'animationStart' }
  | { type: 'pitchApplied'; code: PitchCode; balls: number; strikes: number }
  | { type: 'paFinished'; entry: PlayLogEntry; state: GameState }
  | { type: 'gameFinished'; winner: Side | 'tie'; walkoff: boolean; state: GameState }
  | { type: 'resetPlay'; seed: number };

/** 한 판에 쌓는 TMI 최대 개수 (PRD 핵심 기능 2) */
const MAX_TMIS = 3;

export const initialSession: SessionState = {
  screen: 'home',
  situation: null,
  extra: {},
  mode: 'real',
  seed: 1,
  tmis: [],
  interpreting: false,
  notice: '',
  providerDisabled: false,
  verdicts: {},
  judgingId: null,
  live: null,
  log: [],
  status: 'ready',
  final: null,
};

/** TMI·모드를 바꿀 수 있는가: 장면 첫 타석에 아직 공을 던지지 않았고 연출 중이 아닐 때만 */
export function canEditTmi(s: SessionState): boolean {
  return s.live !== null && s.live.paIndex === 0 && s.live.pitches.length === 0 && s.status === 'ready';
}

const freshLive = (state: GameState): LiveState => ({ state, balls: 0, strikes: 0, paIndex: 0, pitches: [] });

/** 재생 액션을 받을 수 있는가: 장면이 열려 있고 경기가 끝나지 않았다 */
const isPlaying = (s: SessionState): s is SessionState & { live: LiveState } => s.live !== null && s.status !== 'finished';

/**
 * 세션 reducer (순수). 조건에 맞지 않는 액션은 같은 객체를 돌려준다.
 * 비동기 결과(interpretDone·interpretFailed·judgeDone)는 짝이 되는 시작 액션이 받아들여졌을 때만 반영한다.
 */
export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'navigate': {
      const screen = (a.screen === 'play' || a.screen === 'result') && s.situation === null ? 'home' : a.screen;
      return screen === s.screen ? s : { ...s, screen };
    }

    case 'openSituation':
      return {
        ...s,
        screen: 'play',
        situation: a.situation,
        extra: a.extra ?? {},
        seed: a.seed,
        mode: a.mode ?? s.mode,
        tmis: a.tmis ?? [],
        // 옛 상황에서 시작한 해석·판정 결과는 받지 않는다
        interpreting: false,
        judgingId: null,
        notice: '',
        verdicts: {},
        live: freshLive(a.situation.state),
        log: [],
        status: 'ready',
        final: null,
      };

    case 'setMode':
      return canEditTmi(s) && a.mode !== s.mode ? { ...s, mode: a.mode } : s;

    case 'interpretStart':
      return canEditTmi(s) && !s.interpreting && s.tmis.length < MAX_TMIS ? { ...s, interpreting: true } : s;

    case 'interpretDone': {
      if (!s.interpreting) return s;
      // 해석을 기다리는 사이 공을 던졌거나 가득 찼으면 넣지 않는다. 거부된 문장은 TMI 칸을 차지하지 않고 이유만 알린다(UI_GUIDE)
      const { refused, reason } = a.entry.interpretation;
      const add = !refused && canEditTmi(s) && s.tmis.length < MAX_TMIS && !s.tmis.some((e) => e.id === a.entry.id);
      return {
        ...s,
        tmis: add ? [...s.tmis, a.entry] : s.tmis,
        interpreting: false,
        notice: refused ? reason || a.note : a.note,
        providerDisabled: s.providerDisabled || a.disableProvider,
      };
    }

    case 'interpretFailed':
      return s.interpreting ? { ...s, interpreting: false, notice: a.note } : s;

    case 'removeTmi': {
      if (!canEditTmi(s) || !s.tmis.some((e) => e.id === a.id)) return s;
      return {
        ...s,
        tmis: s.tmis.filter((e) => e.id !== a.id),
        verdicts: Object.fromEntries(Object.entries(s.verdicts).filter(([id]) => id !== a.id)),
        judgingId: s.judgingId === a.id ? null : s.judgingId,
      };
    }

    case 'judgeStart': {
      const entry = s.tmis.find((e) => e.id === a.id);
      if (!entry || entry.interpretation.refused || s.judgingId !== null) return s;
      return { ...s, judgingId: a.id };
    }

    case 'judgeDone':
      if (s.judgingId !== a.id) return s;
      return {
        ...s,
        verdicts: { ...s.verdicts, [a.id]: a.verdict },
        judgingId: null,
        notice: a.note,
        providerDisabled: s.providerDisabled || a.disableProvider,
      };

    case 'animationStart':
      return s.live !== null && s.status === 'ready' ? { ...s, status: 'animating' } : s;

    case 'pitchApplied': {
      if (!isPlaying(s)) return s;
      const { live } = s;
      return {
        ...s,
        status: 'ready',
        live: {
          ...live,
          balls: a.balls,
          strikes: a.strikes,
          pitches: [...live.pitches, { balls: live.balls, strikes: live.strikes, code: a.code }],
        },
      };
    }

    case 'paFinished':
      if (!isPlaying(s)) return s;
      return {
        ...s,
        status: 'ready',
        log: [...s.log, a.entry],
        live: { state: a.state, balls: 0, strikes: 0, paIndex: s.live.paIndex + 1, pitches: [] },
      };

    case 'gameFinished':
      if (!isPlaying(s)) return s;
      return { ...s, status: 'finished', screen: 'result', final: { winner: a.winner, walkoff: a.walkoff, state: a.state } };

    case 'resetPlay':
      // 공이 날아가는 중에는 되돌리지 않는다 (연출이 끝난 뒤 pitchApplied가 새 판에 섞이지 않게)
      if (s.situation === null || s.live === null || s.status === 'animating') return s;
      return { ...s, screen: 'play', seed: a.seed, live: freshLive(s.situation.state), log: [], status: 'ready', final: null };

    default:
      return s;
  }
}
