# Step 2: app-shell

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("데이터 흐름"의 브라우저, "패턴", "상태 관리")
- `/docs/PRD.md` (한 판의 흐름, 핵심 기능 1)
- `/docs/UI_GUIDE.md` (전부: 색상·컴포넌트·레이아웃·타이포·문구)
- `/docs/ADR.md` (ADR-001, ADR-005, ADR-006, ADR-010)
- 이전 step 산출물: `src/game/*.ts` (scene, effects, selectors, share, session, engineClient, playback)
- 공개 API: `src/ai/index.ts`(`interpretTmi`, `judgeTmi`, `pickProvider`, `resolveArtifactSample`), `src/stage/index.ts`, `src/engine/index.ts`
- 기존 셸: `src/main.tsx`, `src/app/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, `index.html`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### 데이터 — `src/data/appData.ts`
- `loadAppData(files: Record<string, unknown>): AppData | null` — 경로가 `/core.json`, `/pitches.json`, `/scenes.json`으로 끝나는 세 파일이 모두 있고 모양이 맞으면 AppData, 하나라도 없으면 null. `/evidence.json`, `/trust.json`은 없으면 null.
- `APP_DATA: AppData | null = loadAppData(import.meta.glob('../../data/build/app/*.json', { eager: true, import: 'default' }))`
- `todaySceneIndex(isoDate: string, count: number): number` — 2026-01-01부터 지난 날 수 % count(음수 없음).

### 라우팅 — `src/app/router.ts`, `src/app/useHashRoute.ts`
- `Route = { screen: 'home' } | { screen: 'play'; sceneId: string; share: SharePayload | null } | { screen: 'result' } | { screen: 'evidence' } | { screen: 'about' }`
- `parseHash(hash: string): Route` — `#/`, `#/scene/:id`, `#/scene/:id?t=<encodeShare>`, `#/result`, `#/evidence`, `#/about`. 모르는 값은 home. `formatRoute(route: Route): string`.
- `useHashRoute(): [Route, (r: Route) => void]` — `hashchange` 구독.

### 플랫폼 어댑터 — `src/app/platform.ts`
- `Platform { artifactSample: SampleLike | null; downloads: { save(req: { filename: string; data: Blob }): Promise<unknown> } | null; apiBase: string | null; createEngineClient(): EngineClient; today(): string }`
- `detectPlatform(win: Window & typeof globalThis): Promise<Platform>` — `resolveArtifactSample(win)`, `win.claude?.use?.('downloads')`(없거나 null이면 null), `import.meta.env.VITE_AI_API_BASE ?? null`, 오늘 날짜(YYYY-MM-DD, Asia/Seoul).
- `createEngineClient`: `typeof Worker !== 'undefined'`이면 **동적** `import('../game/engine.worker?worker&inline')`로 워커를 만들어 `createWorkerEngineClient`, 실패하거나 Worker가 없으면 `createLocalEngineClient()`. 워커 준비 전 요청은 지역 클라이언트로 처리해도 된다.
- 테스트는 `win` 가짜 객체로 artifact 있음/없음, downloads null, Worker 없음 → 지역 클라이언트를 확인한다.

### 상태 공급자 — `src/app/GameProvider.tsx`
- props: `{ data: AppData; platform: Platform; children }` (테스트에서 픽스처와 가짜 플랫폼을 주입)
- 컨텍스트 값: `{ data, platform, session, dispatch, setup: SceneSetup | null, engine: EngineClient, provider: AiProvider | null, actions }`
  - `setup`: `session.sceneId`가 바뀔 때 `buildSceneSetup`으로 만든다(useMemo).
  - `provider`: `pickProvider({ artifactSample, apiBase, fetch })`, `session.providerDisabled`면 null로 취급.
  - `actions.openScene(sceneId: string, share: SharePayload | null)`: `openScene`(startState = scene.state, seed = 날짜와 장면 id로 만든 정수) 후 share가 있으면 texts를 순서대로 `submitTmi`.
  - `actions.submitTmi(text)`: `interpretStart` → `interpretTmi(text, setup.promptContext, provider, { measuredAvailable })` → 결과 `{ interpretation, note, disableProvider }`로 `interpretDone`(entry id는 컴포넌트 안 증가 카운터 `tmi-1`, `tmi-2` …). 빈 문자열 Error는 `interpretFailed`.
  - `actions.removeTmi(id)`, `actions.setMode(mode)`, `actions.judge(id)`(`judgeStart` → `judgeTmi(entry.text, entry.interpretation, setup.promptContext, data.evidence, provider)` → 결과 `{ verdict, note, disableProvider }`로 `judgeDone`), `actions.resetPlay()`(seed + 1).
- `useGame()` 훅(컨텍스트 없으면 Error).

### 앱 셸 — `src/app/App.tsx` (기존 파일 교체)
- `App({ data = APP_DATA, platformPromise })`: 데이터가 null이면 안내 화면("앱 데이터가 없어요. `npm run data`로 만든 뒤 다시 빌드하세요."). 플랫폼이 준비되기 전에는 지역 엔진·AI 없음으로 먼저 그린다(첫 화면을 막지 않는다).
- 구조: `<header>`(로고 텍스트 "TMI 야구", 내비 "장면"·"판정소"·"만든 이유"), `<main>`(라우트별 화면), `<footer>`(출처 문구). 스타일은 `App.module.css`, UI_GUIDE 토큰만 쓴다.
- 라우트 → 화면: home `HomeScreen`, play `PlayScreen`, result `ResultScreen`, evidence `EvidenceScreen`, about `AboutScreen`. play 라우트로 들어오면 `actions.openScene(sceneId, share)`(같은 장면이 이미 열려 있으면 다시 열지 않음).
- 이 step에서는 `PlayScreen`, `ResultScreen`, `EvidenceScreen`, `AboutScreen`을 제목 한 줄짜리 자리 표시 컴포넌트로 만든다(각각 `src/app/screens/<이름>.tsx` + 테스트). 이후 step이 파일 내용을 채운다.
- 기존 `App.test.tsx`, `main.test.tsx`를 새 구조에 맞게 고친다(제목·부제·출처 문구 검증은 유지).

### 첫 화면 — `src/app/screens/HomeScreen.tsx`, `src/components/SceneCard.tsx`
- HomeScreen:
  - 상단: 부제 "쓸모없는 변수, 진짜 쓸모없을까?"와 한 줄 설명 "실제 KBO 명장면에 쓸데없는 TMI를 걸면, 타석·이닝·경기 승률이 어떻게 바뀌는지 계산하고 그 장면을 다시 치러요."
  - "오늘의 장면" 카드 하나(`todaySceneIndex(platform.today(), scenes.length)`)와 버튼 "이 장면에 TMI 걸기" → play 라우트.
  - 흐름 안내 세 단계(순서가 정보이므로 번호 사용 가능): 장면 고르기 → TMI 한 줄 → 다시 치르기.
  - 모든 장면 목록(날짜 최신순 SceneCard), 판정소·만든 이유 링크.
- SceneCard(button 또는 링크): 날짜 "8월 25일", "KIA 4 : 4 롯데"(장면 시점 점수), 상황 문장, 구장, 승부처 지수 막대(`leverage` 0~60%p를 0~100% 폭으로). **실제 결과는 보여주지 않는다.** 팀 컬러는 작은 색 막대로만.

### 테스트
- appData: 픽스처 파일 레코드로 AppData, 필수 파일 누락 → null, 선택 파일 누락 → null 필드. todaySceneIndex 경계.
- router: 모든 라우트 왕복, 잘못된 share 값 → share null, 모르는 해시 → home.
- platform: 가짜 win 조합.
- GameProvider: 픽스처 데이터 + 가짜 플랫폼(지역 엔진, AI 없음)으로 openScene → setup 생성, submitTmi("오늘 폭염") → 규칙 해석 entry 추가, removeTmi, 편집 잠금 시 무시.
- App: 데이터 null 안내, 해시에 따라 화면 전환, 헤더 내비.
- HomeScreen·SceneCard: 오늘의 장면 버튼이 play 해시로 이동, 카드에 실제 결과 문구가 없음.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 외부 입출력(window.claude, Worker, fetch)이 `src/app/platform.ts`와 `src/ai/providers`에만 있는가?
   - UI_GUIDE 안티패턴(블러, 그라데이션 텍스트, 보라색, 글로우, 균일한 큰 라운드)을 쓰지 않았는가?
   - 휴대폰 390px에서 가로 스크롤이 생기지 않는 CSS인가? (고정 폭 금지, `min-width` 금지)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 라우터·상태관리·UI 라이브러리를 설치하지 마라. 이유: ADR-007.
- localStorage 등 브라우저 저장소를 쓰지 마라. 이유: ARCHITECTURE "상태 관리".
- 장면 카드나 첫 화면에 실제 결과를 노출하지 마라. 이유: PRD(결과는 끝나고 공개).
- 경기장·확률판·결과 화면의 실제 내용을 이 step에서 만들지 마라. 이유: 다음 step의 범위다.
- 엔진·AI·스테이지 코드를 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라(바뀐 구조에 맞춰 고치는 것은 허용).
