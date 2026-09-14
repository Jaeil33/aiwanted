# Step 2: play-hud

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 3·4·5), `/docs/UI_GUIDE.md` (플레이, 컴포넌트 규격, 움직임, 문구)
- `/docs/ADR.md` (ADR-009, ADR-011, ADR-012, ADR-015)
- `docs/design/nightgame/index.html`·`style.css`·`app.mjs` (화면 2 플레이 — 시각 기준, import 금지)
- `src/app/screens/PlayScreen.tsx`, `PlayScreen.module.css`, `PlayScreen.test.tsx`
- `src/app/usePlayback.ts` (step 0: `skip`, `ready`, `onCall`), `src/app/useSceneEvaluations.ts`
- `src/game/selectors.ts` (`selectTiers`, `entryChips`, `battingWin`), `src/game/scene.ts`, `src/types/data.ts` (`PlayerRecord.line`)
- 9-ui-system 컴포넌트: `Scorebug`, `Callout`, `TugGauge`, `Tabs`, `Chip`, `FoilFrame`, `IconButton`, `PitchButton`, `Sheet`
- 10-stage-broadcast: `BallparkStage`(variant 'play')
- 기존 `PlayLog`, `WpChart` (기록 시트 안에서 재사용)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/app/screens/PlayScreen.tsx` 다시 만들기 (`GameFrame` 안, 휴대폰 열 480px 기준)
1. **경기장 영역**(높이 420px, 전체 폭): `BallparkStage` variant 'play'. 위에 겹치는 것:
   - 좌상단 `Scorebug`. 누르면 기록 시트가 열린다(버튼 역할, 접근 이름 "기록 보기").
   - 우상단 `IconButton` "처음부터": `clearMarkers` + `resetPlay`. 재생 중이면 먼저 `skip()`.
   - 가운데 `Callout`: `onCall`로 받은 text·tone·key.
   - 아래 자막(하단 60px 스크림):
     - 타자: "타자 · 좌타/우타", 이름, `line`이 있으면 "타율 .342 · OPS .884"(OBP+SLG, 소수 셋째 자리, 앞 0 없음)
     - 가운데: VS
     - 투수: "투수 · 우투/좌투", 이름, "ERA 2.65 · WHIP 1.53"
     - 기록이 없는 선수는 숫자 줄을 숨긴다.
2. **승률 판**:
   - `Tabs` 타석·이닝·경기(기본 경기)와 TMI 변화 칩
   - `TugGauge`: `selectTiers` 결과를 탭별로 연결한다. 이닝 탭은 extra 문구 "기대 득점 N.NN점", ghost는 TMI 없음 값이다.
   - 아래 줄: 모드 칩(현실 / 만화는 toon 칩 "효과 6배 과장"), 근거 등급 칩(TMI 톤들), "TMI 없음 N.N%"
3. **TMI 칸 3개**:
   - 채운 칸: `FoilFrame`(등급)에 짧은 문장(앞 12자) + 손잡이 칩 + 그 TMI의 효과 %p(step 3에서 채움, 이번 step은 칩까지만)
   - 빈 칸: 점선 "+ TMI"
   - 누르면 `onOpenTmi()`로 TMI 시트를 연다. 이번 step의 시트 내용은 기존 `TmiComposer`+`InterpretationCard`를 `Sheet`에 넣은 임시 구성이고, step 3에서 교체한다.
4. **하단 도크**(sticky, 100px):
   - 왼쪽 "이 타석 끝까지"
   - 가운데 `PitchButton`: 재생 중이면 mode 'skip'이고 `skip()`을 부른다. 아니면 'pitch'이고 `throwPitch()`.
   - 오른쪽 "경기 끝까지"
   - `ready`가 false면 세 버튼을 비활성화하고 도크 위에 "경기장 준비 중…"(aria-live)을 띄운다.
   - 경기가 끝나면 결과 화면으로 간다(기존 규칙).
5. **기록 시트**(`Sheet`): `PlayLog`(최신이 위)와 `WpChart`(원정 공격이면 무승부를 반영한 값). 기존 `trail` 규칙을 유지하되, trail이 없을 때는 로그의 tie 값을 쓴다. 필요하면 로그 항목에 `tieAfter`를 더한다(세션 수정 허용, 테스트 포함).

- **스타일**: 토큰만 쓰고, UI_GUIDE 간격·반경 표를 따른다. 1024px 이상에서도 같은 게임 열이다.
- **숨긴 요소**: 기존 `ProbabilityTiers`·`PlayControls`·`ModeToggle`은 이 화면에서 쓰지 않는다(파일 삭제는 step 5).

### 테스트 (`PlayScreen.test.tsx` 다시 쓰기)
- 스테이지 가짜 forwardRef와 가짜 엔진으로 확인할 것:
  - 스코어버그·자막(선수 기록 있음/없음)
  - 탭 전환 시 게이지 라벨·값
  - 모드·등급 칩
  - TMI 칸 3개와 채운 칸
  - `ready` false일 때 도크 비활성과 안내
  - 재생 중 가운데 버튼이 건너뛰기로 바뀌고 skip이 불린다
  - 처음부터
  - 기록 시트 열기·닫기
  - 끝나면 `#/result`
  - Callout이 onCall을 받아 표시한다

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/app src/components src/game
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 확률·기대 득점이 엔진·selector에서만 오는가?
   - 모드·근거 등급 라벨이 숫자 옆에 있는가(CLAUDE.md, ADR-009)?
   - 주요 버튼이 48px 이상이고 동작 줄이기를 지키는가?
   - 결과 스포일러가 없는가?
3. `phases/11-screens/index.json`의 step 2를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 화면 컴포넌트 안에서 확률을 계산하지 마라. 이유: CLAUDE.md(엔진만 계산).
- 설명 문단("실제 결과는 경기가 끝나면…" 같은 안내 글)을 경기장 위아래에 늘어놓지 마라. 이유: ADR-011(경기장이 화면이다). 필요한 안내는 한 줄 aria-live로.
- 옛 컴포넌트 파일을 지우지 마라. 이유: step 3·5에서 교체·정리한다.
- 기존 테스트를 깨뜨리지 마라(바뀐 화면 테스트는 새 기준으로 다시 쓴다).
