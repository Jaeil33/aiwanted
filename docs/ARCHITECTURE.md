# 아키텍처

## 디렉토리 구조
```
src/
├── main.tsx                # mount(el) 부트스트랩
├── app/                    # App 셸, 해시 라우터, 화면(Home·Play·Result·Evidence·About), platform.ts 어댑터
├── components/             # 재사용 UI (Scorebug, ProbabilityTiers, TmiComposer, InterpretationCard, WpChart, ShareCard …)
├── engine/                 # 확률 엔진(순수): matchup, knobs, effects, transitions, count, halfInning, game, playout, measured
├── stage/
│   ├── math/               # 카메라 투영·투구 궤적·타구 비행·자세 보간(순수)
│   ├── render/             # 캔버스 그리기와 연출 컨트롤러 createStage
│   └── BallparkStage.tsx   # React 래퍼
├── ai/                     # safety, normalize, rules, prompts, interpret, verdict(순수)
│   └── providers/          # artifact(sample), http(/api), none — 외부 호출은 여기서만
├── game/                   # 세션 reducer·selectors·장면 조립·재생 계획·공유 인코딩(순수) + engineClient(워커)
├── data/                   # appData 로더(import.meta.glob) + 조회 헬퍼
├── domain/                 # 런타임 상수: 이벤트·팀·손잡이 메타, measured.json
├── styles/                 # tokens.css, global.css
├── types/                  # domain.ts, data.ts (타입만)
└── test/                   # setup.ts, fixtures/
api/                        # 서버리스 함수: interpret.ts, verdict.ts, _lib/
pipeline/
├── tmi_pipeline/           # 원자료 로더, snapshot, context, weather, evidence, trust_states, build CLI
└── tests/                  # pytest + fixtures(합성)
scripts/                    # execute.py(하네스), run-python.mjs, trust-report.ts, check-artifact.mjs
reference/tmi-prototype/    # 1차 JS 프로토타입(이식 참고용, 수정 금지)
data/                       # git 제외: raw/(원자료 캐시), build/(생성물)
phases/                     # 하네스 step 정의
```

## 데이터 흐름
```
[오프라인: npm run data]
data/raw/naver/relay/*.json                 2026-08-01~09-13 중계 140경기 (타석·투구·PTS·네이버 승리확률)
data/raw/naver/schedule/sched_full_*.json   2021~2026 일정·결과·선발
data/raw/naver/stats/stats_{2025,2026}_{HITTER,PITCHER}_all.json
data/raw/weather/                           Open-Meteo 기록 캐시(없으면 받아서 저장)
  → tmi_pipeline.snapshot      → data/build/app/core.json, pitches.json, scenes.json
  → tmi_pipeline.context       → data/build/context/team_games.json
  → tmi_pipeline.evidence      → data/build/app/evidence.json
  → tmi_pipeline.trust_states  → data/build/trust/states.json → scripts/trust-report.ts → data/build/app/trust.json

[브라우저]
src/data/appData.ts (import.meta.glob eager, 파일이 없으면 해당 부분 null)
 → game 세션 reducer
    ├ TMI 입력 → ai.interpretTmi(provider) → normalize 또는 rules → Interpretation
    ├ 장면 + parts → engine.compileEffects → game/engineClient(워커) → createGame / evaluate
    ├ selectors(3단 승률·차이·라벨) → components / 화면
    ├ 재생: game.planPlayback → engine.playout(시드 난수) → stage.playPitch …
    └ "진짜야?" → ai.judgeTmi(provider, lookupEvidence 도구) → Verdict

[배포 서버리스]
api/interpret.ts, api/verdict.ts → Anthropic Messages API (환경변수 ANTHROPIC_API_KEY)
```

## 핵심 계약
### 사건·상태 (`src/types/domain.ts`)
- 사건 벡터 순서는 어디서나 `[K, BB(+HBP), HR, 3B, 2B, 1B, OUT(인플레이 아웃)]`, 길이 7.
- 베이스는 비트마스크(1루=1, 2루=2, 3루=4). `half` 0=초(원정 공격), 1=말(홈 공격).
- `GameState { inning, half, outs, bases, away, home, slotAway, slotHome }`. 점수는 팀별 득점, slot은 다음 타자 타순(0~8).
- 선수 능력 `rel`은 리그 대비 상대값 벡터(길이 7). 타석 분포 = `bRel × pRel × lg × 효과배수`를 합이 1이 되게 정규화.

### 효과 (TMI → 엔진)
- 해석 결과 `Interpretation.parts`는 `KnobPart`(14개 손잡이) 또는 `MeasuredPart`(실측 변수).
- `engine.compileEffects(parts, sceneCtx, evidence)`가 대상(타자·투수·공격팀·수비팀·모두)을 선수 id·진영으로 확정한 `EngineEffect { applies, logOdds, scope, sourceId }`로 바꾼다. TMI를 넣은 순간의 타자·투수가 대상이다.
- 적용: 타석마다 해당하는 효과의 logOdds 합 × 모드 배수(현실 1, 만화 6)를 ±상한(현실 0.45, 만화 1.6)으로 자른 뒤 `exp`. `scope: 'pa'` 효과는 장면의 첫 타석에만 적용한다.
- 손잡이 효과 = `STEP(0.06) × 세기 × 손잡이 가중치`. 실측 효과 = evidence의 득점 배수를 리그 평균 타선의 득점 탄력성으로 나눈 크기 × 공격 벡터.

### 확률 (`src/engine`)
- `createGame(cfg).evaluate(state, pitcher, { first })` → `{ batSide, pa, batterWin, pitcherWin, inningScore, expRuns, winHome, tie, winAway, after[7], count }`.
- 현재 반이닝은 장면 투수가 끝까지 던지고, 이후 반이닝은 각 팀 불펜 합성 선수가 던진다. 11회말이 끝나면 무승부, 9회 이후 끝내기, 9회말 이후 홈팀이 앞서면 공격하지 않는다.
- 확률은 정확 계산(마르코프 질량 전파 + 동적 계획)이다. 재생(`playout`)만 시드 난수로 표본을 뽑는다.

### 데이터 (`src/types/data.ts` ↔ `pipeline`)
- 파이프라인 JSON의 필드 이름은 `src/types/data.ts`와 같다. 한쪽을 바꾸면 양쪽 테스트를 함께 고친다.
- 투구 행 `PitchRow` = `[type, speed, code(0 B·1 T·2 S·3 F·4 X), balls, strikes, stance(0 좌타·1 우타), x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]`, 기준 y0 = 55ft.
- 실측 변수 정의 `src/domain/measured.json`: `id, label, unit, perLabel, who(env|team|opponentStarter), transform(linear center·per·min·max | indicator), applicable, examples`.

### AI (`src/ai`)
- `AiProvider { name, interpret(prompt, signal), verdict(prompt, tools, signal) }`는 원문 JSON만 돌려준다. 검증은 `normalize.ts`가 한다.
- 프로바이더 선택 순서: 아티팩트 런타임 `claude.use('sample')` → 배포 `/api/*` → 없음(규칙 해석).
- 판정(`judgeTmi`)은 도구 `lookupEvidence(variableId)`로 evidence.json 값만 조회한다. 효과 크기는 도구 결과만 인용한다.

## 패턴
- 순수 함수 + 얇은 React 계층. 계산·규칙은 `engine`/`game`/`ai`에서 테스트하고, 컴포넌트는 selector 결과만 그린다.
- 무거운 `createGame`은 `game/engineClient.ts`가 인라인 Web Worker로 돌린다. 테스트나 워커가 없는 환경은 동기 실행으로 대신한다.
- 캔버스 연출은 명령형 컨트롤러(`createStage`)로 두고 React는 ref로만 조작한다.
- 외부 입출력(네트워크, 아티팩트 런타임, 다운로드·공유)은 `ai/providers`와 `app/platform.ts` 어댑터에만 둔다.

## 상태 관리
- 전역 상태는 `GameProvider`의 `useReducer(sessionReducer)` 하나: 화면, 장면 id, TMI 목록, 모드, 재생 상태, 판정 결과.
- 파생 값(3단 승률, 차이, 라벨)은 selector + `useMemo`. 엔진 결과는 `engineClient`가 장면·효과·모드 서명으로 캐시한다.
- URL 해시 라우팅: `#/`, `#/scene/:id`, `#/result`, `#/evidence`, `#/about`. 공유 링크는 `#/scene/:id?t=<base64url(JSON)>`.
- 브라우저 저장소(localStorage 등)는 쓰지 않는다. 공유할 값은 URL 해시에 둔다.
