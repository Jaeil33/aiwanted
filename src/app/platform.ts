import { resolveArtifactSample, type SampleLike } from '../ai';
import { createLocalEngineClient, createWorkerEngineClient, type EngineClient, type WorkerLike } from '../game';
import { createLiveApi, type LiveApi } from '../live/providers/http';
import { shareLinkWith, type NavigatorLike, type ShareOutcome } from './shareLink';

/*
 * 플랫폼 어댑터: 브라우저·아티팩트 런타임 입출력(window.claude, Worker, fetch, 오늘 날짜)은 여기서만 만진다(ARCHITECTURE "패턴").
 */

export interface DownloadsLike {
  save(req: { filename: string; data: Blob }): Promise<unknown>;
}

export interface Platform {
  /** 아티팩트 런타임 claude.use('sample'). 아티팩트 밖이면 null */
  artifactSample: SampleLike | null;
  /** 아티팩트 런타임 claude.use('downloads'). 없으면 null */
  downloads: DownloadsLike | null;
  /** 서버리스 함수 주소. 아티팩트 모드면 null, 아니면 기본 `/api`. AI와 경기 API가 같은 주소를 쓴다 */
  apiBase: string | null;
  /** 배포 AI·경기 API 호출에 넘길 fetch. 없으면 서버를 쓰지 않는다 */
  fetch?: typeof fetch;
  /** 지난 경기·실시간 경기 클라이언트. apiBase나 fetch가 없으면 null */
  liveApi: LiveApi | null;
  createEngineClient(): EngineClient;
  /** 오늘 날짜 YYYY-MM-DD (Asia/Seoul) */
  today(): string;
  /** 링크 공유(공유 시트 → 클립보드). 없으면 공유 버튼이 안내만 한다 */
  shareLink?(url: string, title: string): Promise<ShareOutcome>;
}

/** 엔진 워커: 응답(message)과 로드 실패(error) 이벤트를 받는다. 브라우저 Worker가 그대로 맞는다 */
export type EngineWorker = WorkerLike & {
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
};

const SEOUL_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 서울 시간 기준 YYYY-MM-DD */
export function seoulDate(date: Date): string {
  const parts = SEOUL_DATE.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const isObjectLike = (x: unknown): x is object => (typeof x === 'object' && x !== null) || typeof x === 'function';

/** 아티팩트 런타임 claude.use('downloads'). 없거나 null·reject·save 없는 값이면 null */
async function resolveDownloads(win: unknown): Promise<DownloadsLike | null> {
  const claude = isObjectLike(win) ? (win as { claude?: unknown }).claude : undefined;
  if (!isObjectLike(claude) || typeof (claude as { use?: unknown }).use !== 'function') return null;
  try {
    const downloads: unknown = await (claude as { use(name: string): unknown }).use('downloads');
    return isObjectLike(downloads) && typeof (downloads as { save?: unknown }).save === 'function' ? (downloads as DownloadsLike) : null;
  } catch {
    return null;
  }
}

/** 환경변수가 없을 때의 서버 주소: 같은 출처의 /api */
const DEFAULT_API_BASE = '/api';

/**
 * 서버 주소를 정한다. 단일 HTML 아티팩트에는 서버가 없으므로 그 모드에서만 null이고, 그 밖에는 기본이 `/api`다.
 * 2026-09-22 배포는 `VITE_AI_API_BASE`가 없어 apiBase가 null이었고 브라우저가 `/api`를 아예 부르지 않았다(ADR-028·029).
 * 환경변수는 `VITE_API_BASE`를 먼저 보고, 이미 배포에 들어 있는 `VITE_AI_API_BASE`도 그대로 받는다.
 * (Vite는 `import.meta.env.VITE_*`를 빌드 때 글자로 바꾼다. 키를 변수로 찾지 말고 하나씩 적어야 한다)
 */
function apiBaseFromEnv(): string | null {
  if (import.meta.env.MODE === 'artifact') return null;
  const explicit: unknown[] = [import.meta.env.VITE_API_BASE, import.meta.env.VITE_AI_API_BASE];
  for (const value of explicit) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return DEFAULT_API_BASE;
}

/** 인라인 워커(단일 HTML에도 들어간다). 테스트 환경을 깨지 않게 동적으로만 불러온다 */
async function loadEngineWorker(): Promise<EngineWorker> {
  const { default: EngineWorkerConstructor } = await import('../game/engine.worker?worker&inline');
  return new EngineWorkerConstructor({ name: 'tmi-engine' });
}

/** 실행 환경을 알아낸다: 아티팩트 런타임(sample·downloads), 배포 AI 주소, fetch, 워커 사용 여부, 오늘 날짜 */
export async function detectPlatform(win: Window & typeof globalThis, opts: { now?: () => Date } = {}): Promise<Platform> {
  const [artifactSample, downloads] = await Promise.all([resolveArtifactSample(win), resolveDownloads(win)]);
  const now = opts.now ?? (() => new Date());
  const hasWorker = typeof (win as { Worker?: unknown }).Worker !== 'undefined';
  const fetchImpl: unknown = (win as { fetch?: unknown }).fetch;
  const browserFetch = typeof fetchImpl === 'function' ? (fetchImpl as typeof fetch) : undefined;
  const apiBase = apiBaseFromEnv();
  return {
    artifactSample,
    downloads,
    apiBase,
    fetch: browserFetch,
    liveApi: apiBase !== null && browserFetch ? createLiveApi({ baseUrl: apiBase, fetch: browserFetch }) : null,
    createEngineClient: () => createPlatformEngineClient({ loadWorker: hasWorker ? loadEngineWorker : null }),
    today: () => seoulDate(now()),
    shareLink: (url, title) => shareLinkWith((win as { navigator?: NavigatorLike }).navigator, url, title),
  };
}

/** 플랫폼을 알아내기 전 기본값: 지역 엔진, AI·다운로드 없음 */
export function localPlatform(opts: { now?: () => Date } = {}): Platform {
  const now = opts.now ?? (() => new Date());
  return {
    artifactSample: null,
    downloads: null,
    apiBase: null,
    liveApi: null,
    createEngineClient: () => createLocalEngineClient(),
    today: () => seoulDate(now()),
  };
}

const closedError = () => new Error('엔진 클라이언트가 이미 닫혔다');

/**
 * 워커 클라이언트와 지역 클라이언트를 감싼다. 첫 요청 때 워커를 띄우고, 띄우지 못하거나(loadWorker 없음·reject)
 * 워커가 error 이벤트를 내면(아티팩트 CSP가 blob 워커를 막는 경우 등) 아직 응답을 못 받은 요청과 이후 요청을 지역 클라이언트로 계산한다.
 * 워커가 돌려준 계산 오류는 그대로 reject한다.
 */
export function createPlatformEngineClient(opts: {
  loadWorker: (() => Promise<EngineWorker>) | null;
  createLocal?: () => EngineClient;
}): EngineClient {
  const makeLocal = opts.createLocal ?? (() => createLocalEngineClient());
  let local: EngineClient | null = null;
  let remote: EngineClient | null = null;
  let ready: Promise<EngineClient | null> | null = null;
  let failed = false;
  let disposed = false;
  /** 워커 응답을 기다리는 요청을 지역 클라이언트로 다시 계산하는 함수들 */
  const fallbacks = new Set<() => void>();

  const localClient = () => (local ??= makeLocal());

  function failOver(): void {
    if (failed) return;
    failed = true;
    const waiting = [...fallbacks];
    fallbacks.clear();
    for (const rerun of waiting) rerun();
    remote?.dispose();
    remote = null;
  }

  function connect(): Promise<EngineClient | null> {
    const load = opts.loadWorker;
    if (!load) return Promise.resolve(null);
    ready ??= load().then(
      (worker) => {
        if (disposed) {
          worker.terminate();
          return null;
        }
        worker.addEventListener('error', () => failOver());
        remote = createWorkerEngineClient(worker);
        return remote;
      },
      () => {
        failed = true;
        return null;
      },
    );
    return ready;
  }

  async function run<T>(call: (client: EngineClient) => Promise<T>): Promise<T> {
    if (disposed) throw closedError();
    const connected = await connect();
    if (disposed) throw closedError();
    if (!connected || failed || !remote) return call(localClient());
    const target = remote;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const rerunLocally = () => {
        if (settled) return;
        settled = true;
        call(localClient()).then(resolve, reject);
      };
      fallbacks.add(rerunLocally);
      call(target).then(
        (value) => {
          if (settled) return;
          settled = true;
          fallbacks.delete(rerunLocally);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          fallbacks.delete(rerunLocally);
          if (failed && !disposed) {
            rerunLocally();
            return;
          }
          settled = true;
          reject(error);
        },
      );
    });
  }

  return {
    evaluate: (req) => run((client) => client.evaluate(req)),
    playout: (req) => run((client) => client.playout(req)),
    dispose() {
      if (disposed) return;
      disposed = true;
      fallbacks.clear();
      remote?.dispose();
      remote = null;
      local?.dispose();
      local = null;
    },
  };
}
