import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { AiError, interpretTmi, judgeTmi, pickProvider, rulesVerdict, type AiProvider } from '../ai';
import {
  buildSituationSetup,
  canEditTmi,
  currentSituation,
  initialSession,
  measuredAvailable,
  sessionReducer,
  type EngineClient,
  type SessionAction,
  type SessionState,
  type SharePayload,
  type SituationExtra,
  type SituationSetup,
} from '../game';
import type { AppData, Situation } from '../types/data';
import type { Mode } from '../types/domain';
import type { Platform } from './platform';

export interface GameActions {
  /** 상황(되돌려볼 한 타석)을 연다. 같은 상황의 공유 값이 있으면 모드를 정하고 TMI를 순서대로 건다 */
  openSituation(situation: Situation, extra: SituationExtra, share: SharePayload | null): Promise<void>;
  /** TMI 한 줄을 해석해 붙인다. 편집이 잠겼거나 해석 중이거나 3개면 AI를 부르지 않는다 */
  submitTmi(text: string): Promise<void>;
  removeTmi(id: string): void;
  setMode(mode: Mode): void;
  /** "진짜야?" 판정. 판정 중이거나 거부된 TMI면 부르지 않는다 */
  judge(id: string): Promise<void>;
  /** 처음부터: TMI는 두고 seed + 1로 재생만 되돌린다 */
  resetPlay(): void;
  /** 여기까지 보기: 이어서 치지 않고 지금까지의 결과로 마무리한다(ADR-033) */
  stopHere(): void;
}

export interface GameContextValue {
  data: AppData;
  platform: Platform;
  session: SessionState;
  dispatch: (action: SessionAction) => void;
  /** 렌더를 기다리지 않은 최신 세션: 비동기 흐름(재생 반복 등)이 dispatch 직후 상태를 읽는다 */
  getSession(): SessionState;
  setup: SituationSetup | null;
  engine: EngineClient;
  /** 이번 화면에서 쓸 AI 프로바이더 (없거나 꺼졌으면 null = 규칙 해석) */
  provider: AiProvider | null;
  actions: GameActions;
}

const GameContext = createContext<GameContextValue | null>(null);

const MAX_TMIS = 3;
/** TMI 입력 한도 (입력창 maxLength·공유 값과 같은 UTF-16 단위) */
const MAX_TMI_UNITS = 80;

/** 재생 seed: 날짜와 장면 id의 FNV-1a 32비트 해시 (0이면 1) */
export function sceneSeed(date: string, sceneId: string): number {
  const key = `${date}#${sceneId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

/** 앞뒤 공백을 지우고 80 UTF-16 단위 안에서 글자(코드 포인트)를 자르지 않고 줄인다 */
function clipTmiText(text: string): string {
  let out = '';
  for (const ch of text.trim()) {
    if (out.length + ch.length > MAX_TMI_UNITS) break;
    out += ch;
  }
  return out;
}

/** 처음 요청할 때 플랫폼 클라이언트를 만들고, dispose 뒤 다시 요청하면 새로 만든다 (StrictMode 가짜 언마운트 대비) */
function createLazyEngine(platform: Platform): EngineClient {
  let inner: EngineClient | null = null;
  const client = () => (inner ??= platform.createEngineClient());
  return {
    evaluate: (req) => client().evaluate(req),
    playout: (req) => client().playout(req),
    dispose() {
      inner?.dispose();
      inner = null;
    },
  };
}

/** 전역 상태 공급자: useReducer(sessionReducer) 하나와 장면 setup·엔진 클라이언트·AI 프로바이더·비동기 action */
export function GameProvider({ data, platform, children }: { data: AppData; platform: Platform; children: ReactNode }) {
  const [session, reactDispatch] = useReducer(sessionReducer, initialSession);
  // reducer는 순수하므로 같은 액션을 ref에도 적용해 둔다: 비동기 action이 렌더를 기다리지 않고 최신 상태를 읽는다
  const stateRef = useRef<SessionState>(initialSession);
  const dispatch = useCallback((action: SessionAction) => {
    stateRef.current = sessionReducer(stateRef.current, action);
    reactDispatch(action);
  }, []);
  const getSession = useCallback(() => stateRef.current, []);

  const engine = useMemo(() => createLazyEngine(platform), [platform]);
  useEffect(() => () => engine.dispose(), [engine]);

  const aiProvider = useMemo(
    () => pickProvider({ artifactSample: platform.artifactSample, apiBase: platform.apiBase, fetch: platform.fetch }),
    [platform],
  );
  const provider = session.providerDisabled ? null : aiProvider;
  const setup = useMemo(
    () => (session.situation === null ? null : buildSituationSetup(data.core, session.situation, session.extra)),
    [data, session.situation, session.extra],
  );

  const latest = useRef({ data, platform, aiProvider });
  useLayoutEffect(() => {
    latest.current = { data, platform, aiProvider };
  }, [data, platform, aiProvider]);

  const controllers = useRef(new Set<AbortController>());
  const judgeController = useRef<AbortController | null>(null);
  const tmiSeq = useRef(0);
  const openSeq = useRef(0);

  useEffect(() => {
    const live = controllers.current;
    return () => {
      for (const controller of live) controller.abort();
      live.clear();
    };
  }, []);

  const actions = useMemo<GameActions>(() => {
    const begin = () => {
      const controller = new AbortController();
      controllers.current.add(controller);
      return controller;
    };
    const end = (controller: AbortController) => {
      controllers.current.delete(controller);
    };
    const abortAll = () => {
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    };
    const currentProvider = () => (stateRef.current.providerDisabled ? null : latest.current.aiProvider);

    async function submitTmi(text: string): Promise<void> {
      const s = stateRef.current;
      const situation = s.situation;
      if (situation === null || !canEditTmi(s) || s.interpreting || s.tmis.length >= MAX_TMIS) return;
      dispatch({ type: 'interpretStart' });
      if (!stateRef.current.interpreting) return;
      const { data: currentData } = latest.current;
      const clean = clipTmiText(text);
      const controller = begin();
      // 이어서 치는 타석이면 그 타석의 타자·투수를 기준으로 해석한다(ADR-033)
      const setupNow = buildSituationSetup(currentData.core, situation, s.extra);
      const paIndex = s.live ? s.live.paIndex : 0;
      const atBat = buildSituationSetup(
        currentData.core,
        currentSituation(setupNow, s.live ? s.live.state : situation.state),
        s.extra,
      );
      try {
        const outcome = await interpretTmi(clean, atBat.promptContext, currentProvider(), {
          measuredAvailable: measuredAvailable(currentData.evidence),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        tmiSeq.current += 1;
        dispatch({
          type: 'interpretDone',
          entry: {
            id: `tmi-${tmiSeq.current}`,
            text: clean,
            interpretation: outcome.interpretation,
            paIndex,
            context: atBat.sceneContext,
          },
          note: outcome.note,
          disableProvider: outcome.disableProvider,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        // 사용자가 AI 호출을 취소했으면(cancelled) 알림 없이 해석 중 표시만 끈다
        const cancelled = error instanceof AiError && error.code === 'cancelled';
        const note = cancelled ? '' : error instanceof Error ? error.message : 'TMI를 해석하지 못했어요.';
        dispatch({ type: 'interpretFailed', note });
      } finally {
        end(controller);
      }
    }

    async function openSituation(situation: Situation, extra: SituationExtra, share: SharePayload | null): Promise<void> {
      const { platform: currentPlatform } = latest.current;
      abortAll();
      openSeq.current += 1;
      const opened = openSeq.current;
      const payload = share !== null && share.sceneId === situation.id ? share : null;
      dispatch({
        type: 'openSituation',
        situation,
        extra,
        seed: sceneSeed(currentPlatform.today(), situation.id),
        mode: payload?.mode,
      });
      if (!payload) return;
      for (const text of payload.texts) {
        if (openSeq.current !== opened) return;
        await submitTmi(text);
      }
    }


    function removeTmi(id: string): void {
      const s = stateRef.current;
      if (!canEditTmi(s) || !s.tmis.some((e) => e.id === id)) return;
      if (s.judgingId === id) judgeController.current?.abort();
      dispatch({ type: 'removeTmi', id });
    }

    function setMode(mode: Mode): void {
      dispatch({ type: 'setMode', mode });
    }

    async function judge(id: string): Promise<void> {
      const s = stateRef.current;
      const situation = s.situation;
      const entry = s.tmis.find((e) => e.id === id);
      if (situation === null || !entry || entry.interpretation.refused || s.judgingId !== null) return;
      dispatch({ type: 'judgeStart', id });
      if (stateRef.current.judgingId !== id) return;
      const { data: currentData } = latest.current;
      const controller = begin();
      judgeController.current = controller;
      try {
        const outcome = await judgeTmi(
          entry.text,
          entry.interpretation,
          buildSituationSetup(currentData.core, situation, s.extra).promptContext,
          currentData.evidence,
          currentProvider(),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        dispatch({ type: 'judgeDone', id, verdict: outcome.verdict, note: outcome.note, disableProvider: outcome.disableProvider });
      } catch {
        if (controller.signal.aborted) return;
        // judgeTmi는 취소일 때만 던진다: 판정 중 표시가 남지 않게 기록표 판정으로 마무리한다
        const verdict = rulesVerdict(entry.text, entry.interpretation, currentData.evidence);
        dispatch({ type: 'judgeDone', id, verdict, note: '', disableProvider: false });
      } finally {
        end(controller);
        if (judgeController.current === controller) judgeController.current = null;
      }
    }

    function resetPlay(): void {
      const s = stateRef.current;
      if (s.situation === null) return;
      dispatch({ type: 'resetPlay', seed: s.seed + 1 });
    }

    function stopHere(): void {
      abortAll();
      dispatch({ type: 'stopHere' });
    }

    return { openSituation, submitTmi, removeTmi, setMode, judge, resetPlay, stopHere };
  }, [dispatch]);

  const value = useMemo<GameContextValue>(
    () => ({ data, platform, session, dispatch, getSession, setup, engine, provider, actions }),
    [data, platform, session, dispatch, getSession, setup, engine, provider, actions],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/** GameProvider 컨텍스트. 밖에서 부르면 Error */
export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame은 GameProvider 안에서만 쓸 수 있다');
  return value;
}
