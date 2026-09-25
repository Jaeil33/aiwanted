# 아키텍처

## 디렉토리 구조
```
src/
├── main.tsx                # mount(el) 부트스트랩
├── app/                    # App 셸, 해시 라우터, 화면(Lobby·Game·Matchup·Custom·Pa·About), 훅(useGames·useLiveGame·usePaPlayback·useSituationEvaluations), platform.ts 어댑터
├── components/             # 재사용 UI (Scorebug, LowerThird, BigOdds, TmiCard, TmiSheet, PaRow, PlayerPicker, ThousandDots, ResultCard, ShareCard, TallyList …)
├── engine/                 # 확률 엔진(순수): matchup, knobs, effects, transitions, count, halfInning, game, playout, measured
├── live/                   # 네이버 중계 파서·요약·응답 검증(순수, ADR-017)
│   └── providers/          # /api/games·/api/game·/api/tally 호출 — 외부 호출은 여기서만
├── stage/
│   ├── math/               # 포수 뒤 트래커 투영·투구 궤적·존 판정(순수, ADR-018)
│   └── render/             # 트래커 캔버스 컨트롤러 createTracker
├── ai/                     # text, safety, targets, lexicon, rules, normalize, prompts, interpret, verdict(순수, ADR-013)
│   └── providers/          # artifact(sample), http(/api), none — 외부 호출은 여기서만
├── game/                   # 상황 조립(situation), 타석 세션 reducer, headline selectors, 재생 계획, 공유 인코딩(순수) + engineClient(워커)
├── data/                   # appData 로더(core·evidence·trust 즉시, pitches·matchups 지연) + 조회 헬퍼
├── domain/                 # 런타임 상수: 이벤트·팀·손잡이 메타, measured.json
├── styles/                 # tokens.css, global.css
├── types/                  # domain.ts, data.ts, live.ts (타입만)
└── test/                   # setup.ts, fixtures/
api/                        # 서버리스 함수: games.ts, game.ts(네이버 프록시), tally.ts(인기 TMI), interpret.ts, verdict.ts(Claude), _lib/
pipeline/
├── tmi_pipeline/           # 원자료 로더, collect(수집), snapshot(전체 선수·팀 기본 타선·투구 표본), matchups, context, weather, evidence, trust_states, build CLI
└── tests/                  # pytest + fixtures(합성)
scripts/                    # execute.py(하네스), run-python.ts, trust-report.ts, check-*.ts, vite-api-dev.ts(개발 /api)
reference/tmi-prototype/    # 1차 JS 프로토타입(이식 참고용, 수정 금지)
docs/design/broadcast/      # UI 시각 기준 시안(ADR-018, import 금지)
docs/design/nightgame/      # 폐기된 시안(참고만, import 금지)
data/                       # git 제외: raw/(원자료 캐시), build/(생성물)
phases/                     # 하네스 step 정의
```

## 데이터 흐름
```
[오프라인: npm run collect → npm run data]
네이버 일정·중계 → data/raw/naver/{schedule,relay}/ (collect, 로컬에서만)
data/raw/naver/stats/stats_2026_{HITTER,PITCHER}_all.json
data/raw/weather/                                  Open-Meteo 기록 캐시
  → snapshot      → data/build/app/core.json(2026 전 선수·10구단 불펜), pitches.json(좌·우 리그 투구 풀만)
  → matchups      → data/build/app/matchups.json(수집한 경기의 타석 색인)
  → context·evidence·trust_states → evidence.json, trust.json (그대로)

[서버리스 (Vercel, icn1)]
GET  /api/games?date= 또는 ?from=&to=(최대 45일) → 네이버 일정 → GameSummary[]        s-maxage=60
GET  /api/game?id=<gameId>      → 네이버 relay(최신 이닝 + 빠진 이닝) → src/live 파서 → LiveGame
                                  진행 중 s-maxage=5 · 경기 전 60 · 끝남 86400, 인스턴스 안 같은 경기 요청 합치기
POST /api/tally {gameId|null, keys} → Upstash Redis REST INCR (TTL 2일)
GET  /api/tally?gameId=         → 상위 5개 TallyRow                               s-maxage=15
POST /api/interpret, /api/verdict → Anthropic Messages API (키가 없으면 503 → 규칙)

[브라우저]
홈(#/): useGames(최근 2주) → recentFinished → useLiveGame ×3 → paList(승부처) 피드
팀(#/team/:code?m=): useGames(그 달) → calendarWeeks(상대 팀·승패 한 글자) → 날짜를 누르면 경기 카드
경기(#/game/:gameId): useLiveGame → paList(승부처 + 반이닝별 전 타석). 타석 결과는 싣지 않는다
상황 만들기: situationFromPa(LiveGame, no, kind) → Situation (customSituation은 아직 없다)
타석 화면(#/pa/:gameId/:no): buildSituationSetup(core, situation, extra) → engineClient.evaluate(TMI 없음·TMI·TMI 만화)
          → gaugesAtCount(count) → broadcast.tierReadout(경기·이닝·타석 3단)
TMI: ai.interpretTmi(provider) → normalize | rules → TmiEntry(건 타석·대상 함께) → /api/tally(효과 키만)
쳐보기: usePlayback(시드 난수 생성기 하나) → samplePitchCode → pickPitchRow(그 경기 그 투수 행 | 리그 풀) → tracker.playPitch
이어가기: 타석이 끝나면 직접 이어 치기 · 경기 끝까지(playout) · 여기까지 보기 가운데 고른다(ADR-033)
진짜야?: ai.judgeTmi(provider, lookupEvidence 도구) → Verdict
```

## 핵심 계약
### 사건·상태 (`src/types/domain.ts`)
- 사건 벡터 순서는 어디서나 `[K, BB(+HBP), HR, 3B, 2B, 1B, OUT(인플레이 아웃)]`, 길이 7.
- 베이스는 비트마스크(1루=1, 2루=2, 3루=4). `half` 0=초(원정 공격), 1=말(홈 공격).
- `GameState { inning, half, outs, bases, away, home, slotAway, slotHome }`. 점수는 팀별 득점, slot은 다음 타자 타순(0~8).
- 선수 능력 `rel`은 리그 대비 상대값 벡터(길이 7). 타석 분포 = `bRel × pRel × lg × 효과배수`를 합이 1이 되게 정규화.

### 실시간 경기 (`src/types/live.ts`)
```ts
export type GameStatus = 'before' | 'live' | 'final' | 'cancelled' | 'suspended';
export interface TeamLine { code: TeamCode; name: string; score: number | null }
export interface GameSummary {
  /** 네이버 경기 id: YYYYMMDD + 원정 코드 + 홈 코드 + 더블헤더 번호 + 시즌 (예: 20260915HTSK02026) */
  gameId: string;
  date: string;              // YYYY-MM-DD
  time: string;              // HH:MM (KST)
  stadium: string;
  away: TeamLine;
  home: TeamLine;
  status: GameStatus;
  inningText: string | null; // 예: "7회말"
}
export interface PaRecord {
  no: number;                // 경기 안 타석 순번, 1부터 시간 순
  before: GameState;         // 첫 투구 직전 상태(outs 0~2)
  batter: string;
  pitcher: string;           // 첫 투구의 투수(ADR-014)
  lineups: { away: string[]; home: string[] }; // 그 시점 타순 0~8의 선수 id
  result: string;            // 중계 결과 문장
  event: EventIndex | null;  // 7사건으로 바꿀 수 없으면 null(주루사로 끝난 타석 등)
  runs: number;
  pitches: PitchRow[];       // 각 행의 balls·strikes는 투구 전
  complete: boolean;         // 결과로 끝났는가(교체·이닝 종료로 끊기면 false)
  wpBeforeHome: number | null; // 0~1, 네이버
  wpAfterHome: number | null;
  startedAt: string | null;  // 첫 투구 시각 HH:MM:SS (KST)
}
export interface LiveGame {
  summary: GameSummary;
  names: Record<string, string>;
  hands: Record<string, { bats?: 'L' | 'R' | 'S'; throws?: 'L' | 'R' }>;
  plateAppearances: PaRecord[]; // no 오름차순
  /** 진행 중 타석. 없으면 null */
  current: { state: GameState; balls: number; strikes: number; batter: string; pitcher: string } | null;
  fetchedAt: string;         // ISO 8601
}
```

### 상황 (`src/types/data.ts`)
```ts
export type SituationKind = 'live' | 'past' | 'custom';
export interface Situation {
  id: string;                // live·past: `${gameId}-${no}`, custom: `custom-${base64url(CustomForm JSON)}`
  kind: SituationKind;
  gameId: string | null;
  paNo: number | null;
  date: string;              // YYYY-MM-DD (custom은 만든 날)
  stadium: string | null;
  away: { code: TeamCode; name: string };
  home: { code: TeamCode; name: string };
  state: GameState;
  count: { balls: number; strikes: number }; // live·past는 0-0
  batter: string;
  pitcher: string;
  lineups: { away: string[]; home: string[] };
  actual: { result: string; event: EventIndex; runs: number; pitches: PitchRow[]; wpAfterHome: number | null } | null;
  naverWpBeforeHome: number | null;
  context: { tempC: number | null; windMs: number | null; dayGame: boolean; dome: boolean };
}
export interface CustomForm {
  away: TeamCode; home: TeamCode;
  inning: number; half: Half; outs: number; bases: Bases;
  awayScore: number; homeScore: number;
  balls: number; strikes: number;
  batter: string; pitcher: string;
  slot: number;              // 고른 타자의 타순 0~8
}
export interface MatchupIndex {
  generatedAt: string;
  range: [string, string];
  games: Array<{ gameId: string; date: string; away: TeamCode; home: TeamCode }>;
  /** [games 인덱스, 타석 no, inning, half, batter id, pitcher id, event(없으면 -1)] */
  rows: Array<[number, number, number, number, string, string, number]>;
}
/** `knob:<KnobId>:<Subject>:<up|down>` 또는 `measured:<MeasuredId>` */
export type TallyKey = string;
export interface TallyRow { key: TallyKey; count: number }
```
- `situationFromPa(game, no, kind)`: count 0-0, `before` 상태, 그 타석 타선·투수, `actual`은 `event`가 null이 아니고 `complete`일 때만 채운다(아니면 되돌려보기 불가로 표시). `dayGame`은 시작 17:00 이전, `dome`은 고척. **`tempC`·`windMs`는 null이다**: 임의의 지난 경기 날씨를 앱에 줄 경로가 아직 없다(19-season step 10).
- `customSituation(core, form)`: 타선은 `core.teamLineups[팀]`(없으면 그 팀 타석 수 상위 9명)으로 채우고 고른 타자를 `slot`에 넣는다(이미 있으면 자리를 바꾼다). 공격 팀 slot = `form.slot`, 수비 팀 slot = 0.
- 선수 조회: 타자는 `<id>:H` 키를 먼저, 투수는 `<id>` 키를 본다. 기록이 없으면 rel 1(리그 평균).

### 효과 (TMI → 엔진)
- 해석 결과 `Interpretation.parts`는 `KnobPart`(14개 손잡이) 또는 `MeasuredPart`(실측 변수).
- `engine.compileEffects(parts, sceneCtx, evidence)`가 대상(타자·투수·공격팀·수비팀·모두)을 선수 id·진영으로 확정한 `EngineEffect { applies, logOdds, scope, sourceId }`로 바꾼다. 상황의 타자·투수가 대상이다.
- 적용: 타석마다 해당하는 효과의 logOdds 합 × 모드 배수(현실 1, 만화 6)를 ±상한(현실 1.2, 만화 2.3, ADR-026)으로 자른 뒤 `exp`. `scope: 'pa'` 효과는 상황의 그 타석에만 적용한다.
- 손잡이 효과 = `STEP(0.3, ADR-026) × 세기 × 손잡이 가중치`. 실측 효과 = evidence의 득점 배수를 리그 평균 타선의 득점 탄력성으로 나눈 크기 × 공격 벡터.

### 확률 (`src/engine`, `src/game`)
- `createGame(cfg).evaluate(state, pitcher, { first })` → `{ batSide, pa, batterWin, pitcherWin, inningScore, expRuns, winHome, tie, winAway, after[7], count }`. `gaugesAtCount(ev, balls, strikes)` → 그 카운트의 `{ dist, winHome, tie, winAway, … }`.
- 현재 반이닝은 상황 투수가 끝까지 던지고, 이후 반이닝은 각 팀 불펜 합성 선수가 던진다. 11회말이 끝나면 무승부, 9회 이후 끝내기, 9회말 이후 홈팀이 앞서면 공격하지 않는다.
- 확률은 정확 계산(마르코프 질량 전파 + 동적 계획)이다. 쳐보기만 시드 난수로 표본을 뽑고, 한 번에 난수 생성기 하나를 이어 쓴다.
- headline(ADR-016):
  - 큰 숫자: `actual`이 있으면 `dist[actual.event]`, 없으면 출루 `1 − dist[K] − dist[OUT]`. TMI 없음 → TMI 순서로 보여준다.
  - 1,000타석: `dist`를 최대 잔여법으로 합 1,000인 정수로 나눈다.
  - 경기 승률 한 줄: 공격 팀 승리 + 무승부/2 (TMI 없음 → TMI, %p).
  - 만화 한 줄: TMI를 만화 모드로 평가한 같은 큰 숫자(ADR-019).

### 데이터 (`src/types/data.ts` ↔ `pipeline`)
- 파이프라인 JSON의 필드 이름은 `src/types/data.ts`와 같다. 한쪽을 바꾸면 양쪽 테스트를 함께 고친다.
- `CoreData`: `meta, league, countTable, players(ADR-021 키 규칙), bullpens, teamLineups`.
- 투구 행 `PitchRow` = `[type, speed, code(0 B·1 T·2 S·3 F·4 X), balls, strikes, stance(0 좌타·1 우타), x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]`, 기준 y0 = 55ft. 네이버 `ptsOptions`와는 `textOption.ptsPitchId == pitchId`로 잇는다.
- 실측 변수 정의 `src/domain/measured.json`: `id, label, unit, perLabel, who(env|team|opponentStarter), transform(linear center·per·min·max | indicator), applicable, examples`.

### AI (`src/ai`)
- `AiProvider { name, interpret(prompt, signal), verdict(prompt, tools, signal) }`는 원문 JSON만 돌려준다. 검증은 `normalize.ts`가 한다.
- 프로바이더 선택 순서: 아티팩트 런타임 `claude.use('sample')` → 배포 `/api/*` → 없음(규칙 해석). 배포 함수가 503(키 없음)을 주면 그 세션은 규칙 해석으로 고정한다.
- 판정(`judgeTmi`)은 도구 `lookupEvidence(variableId)`로 evidence.json 값만 조회한다. 효과 크기는 도구 결과만 인용한다.
- 해석은 거부가 아니면 항상 효과 1개 이상이다(ADR-013). 프롬프트 맥락은 `Situation`에서 만든다.

### 서버 함수 (`api/`)
- 네이버 호출은 `api/_lib/naver.ts`에서만 한다: User-Agent 지정, Origin 헤더 없음, 제한 시간 8초, 재시도 없음. 실패는 502(원격 오류)·504(제한 시간) `{ error }`와 `Cache-Control: no-store`.
- 입력 검증: gameId `^\d{8}[A-Z]{4}\d{5}$`, date `^\d{4}-\d{2}-\d{2}$`, tally keys 1~3개·키 모양 검사.
- IP당 분당 호출 제한(인스턴스 메모리): games·game 60, tally 20, interpret 10, verdict 10.
- 환경변수: `ANTHROPIC_API_KEY`, `TMI_MODEL_INTERPRET`, `TMI_MODEL_VERDICT`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. 응답·로그에 넣지 않는다.
- 배포(ADR-028): Vercel 기본 함수 빌드가 `api/*.ts`를 파일마다 JS로 옮겨 Node ESM으로 불러온다. 그래서 함수가 닿는 모듈의 상대 import는 `.js` 확장자, JSON import는 `with { type: 'json' }`을 쓴다. `api/_lib/nodeEsm.test.ts`가 같은 방식으로 옮긴 함수를 별도 node 프로세스에서 불러 400·503 응답을 네트워크 없이 점검한다. 제한 시간은 `vercel.json` `functions`(verdict 60초, interpret 20초).

## 패턴
- 순수 함수 + 얇은 React 계층. 계산·규칙·파싱은 `engine`/`game`/`ai`/`live`에서 테스트하고, 컴포넌트는 selector 결과만 그린다.
- 무거운 `createGame`은 `game/engineClient.ts`가 인라인 Web Worker로 돌린다. 테스트나 워커가 없는 환경은 동기 실행으로 대신한다.
- 트래커는 명령형 컨트롤러 `createTracker(canvas, deps)`로 두고 React는 ref로만 조작한다. 캔버스는 경기장·존·공만 그리고 콜·결과 글자는 DOM이 그린다. 문서가 숨겨지면 진행 중인 연출을 즉시 끝낸다. 시계·requestAnimationFrame·문서 가시성은 `deps`로 주입한다.
- 외부 입출력(네트워크, 아티팩트 런타임, 다운로드·공유, 폴링 타이머)은 `ai/providers`, `live/providers`, `app/platform.ts`, 폴링 훅(`useLiveGame`)에만 둔다.
- 개발 서버는 Vite 미들웨어가 `api/*.ts`를 그대로 불러 배포와 같은 `/api` 경로를 쓴다.

## 상태 관리
- 전역 상태는 `GameProvider`의 `useReducer(paSessionReducer)` 하나: 상황, TMI 목록, 해석·판정 상태, 쳐보기 상태(카운트·던진 공·결과).
- 경기 목록·실시간 경기 데이터는 훅 상태(`useGames`, `useLiveGame`)이고, 고른 타석만 `Situation`으로 리듀서에 들어간다.
- 파생 값은 selector + `useMemo`. 엔진 결과는 `engineClient`가 상황 id·효과·모드 서명으로 캐시한다.
- URL 해시 라우팅: `#/`, `#/game/:gameId`, `#/matchup`, `#/custom`, `#/pa/:gameId/:no`, `#/pa/custom?s=<base64url(CustomForm)>`, `#/about`. 공유 링크는 타석 경로에 `t=<base64url(TMI 목록)>`를 붙인다.
- 브라우저 저장소(localStorage 등)는 쓰지 않는다. 공유할 값은 URL 해시에 둔다.
