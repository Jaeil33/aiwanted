# Step 5: records-cleanup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 7·8), `/docs/UI_GUIDE.md` (판정소·만든 이유, 타이포그래피, 문구)
- `/docs/ADR.md` (ADR-004, ADR-005, ADR-011, ADR-013, ADR-014)
- `src/app/screens/EvidenceScreen.tsx`, `AboutScreen.tsx`와 테스트, `src/components/EvidenceTable.tsx`, `TrustPanel.tsx`와 테스트
- `src/styles/tokens.css`, `src/styles/tokens.test.ts` (9-ui-system step 0: 옛 토큰 별칭)
- 이전 step 산출물 전체(로비·플레이·TMI 시트·결과). `phases/11-screens/index.json` summary
- 옛 컴포넌트 사용처 확인: `grep -rn "ProbabilityTiers\|PlayControls\|ModeToggle\|TmiComposer\|InterpretationCard\|SceneCard" src`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### 판정소 `EvidenceScreen` · 만든 이유 `AboutScreen` 다시 그리기 (`MenuFrame` 안)
- **공통**: 화면 제목은 `--ui` 900 24px, 부제는 `--dust`, 본문 폭 최대 62자다. 표·차트는 `--plate` 판 위에 두고 숫자는 `--num`으로 쓴다.
- **판정소**:
  - 기존 내용(판정 방법, 학습·검증 경기 수, 변수별 판정표, 엔진 신뢰도)을 유지한다.
  - 판정 칩은 금속색 대신 판정 색을 쓴다: 진짜 `--ball`, 애매 `--strike`, 쓸모없음 `--dim`.
  - `EvidenceTable`·`TrustPanel`의 색·글꼴을 새 토큰으로 바꾼다.
  - 엔진 신뢰도 문장의 경기 수·타석 수·Brier 값은 `trust.json`에서 읽는다(7-scene-data step 2가 다시 만든 값).
- **만든 이유**: 다섯 섹션을 둔다.
  1. LG Aimers 멘탈·클러치 변수 경험
  2. TMI → AI(또는 규칙) 해석 → 엔진 계산 흐름. "숫자는 엔진, 말은 AI", AI가 없을 때 규칙 해석
  3. 근거 등급·모드 뜻
  4. 데이터 출처와 권리: 네이버 스포츠(KBO)·Open-Meteo, 선수 사진·로고 없음
  5. 한계: 주루·교체 모델 단순화, 실측 변수 효과는 작음
  - 개인 이름·연락처·팀원은 쓰지 않는다.

### 정리
- **옛 컴포넌트**: 어디서도 쓰지 않는 컴포넌트와 그 테스트·CSS 모듈을 지운다(`ProbabilityTiers`, `PlayControls`, `ModeToggle`, `TmiComposer`, `InterpretationCard`, `SceneCard` 등, grep으로 사용처 0 확인).
- **옛 토큰 별칭**: `tokens.css`에서 옛 별칭(`--night`, `--booth`, `--dugout`, `--rail`, `--board`, `--chalk-2/3/4`, `--led`, `--led-ink`, `--display`, `--body`, `--led-font`, `--evidence-*`)을 지운다. 남은 사용처는 새 토큰으로 바꾸고 `tokens.test.ts`를 갱신한다. 테스트에서 `src/**/*.css`에 옛 토큰 이름이 없음을 검사한다.
- **모양 수치**: `src/**/*.module.css`의 반경 값이 UI_GUIDE 반경 표(2·6·8·10·12·16px·50%)만 쓰는지 검사하는 테스트를 추가한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(마지막 화면 step이라 전체 테스트를 돌린다).
2. 아키텍처 체크리스트를 확인한다.
   - 화면 어디에도 `leverage`(실제 |WPA|)가 표시되지 않는가?
   - 출처 표시가 로비·만든 이유·결과 실제 결과 판·공유 카드에 있는가(ADR-005)?
   - 금지 목록(blur, 그라데이션 글자, 글로우, 보라색, 픽셀 글꼴, 이모지 아이콘, 스피너)을 grep으로 확인했는가?
3. `npm run build:artifact`를 실행해 단일 HTML 크기를 summary에 적는다.
4. `phases/11-screens/index.json`의 step 5를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 판정 수치·신뢰도 수치를 문서에 손으로 적지 마라. 파일에서 읽어라. 이유: 허위 기재 위험.
- 쓰이는 컴포넌트를 지우지 마라. grep으로 사용처 0을 확인한 것만 지운다. 이유: 빌드 깨짐.
- 기존 테스트를 깨뜨리지 마라(지운 컴포넌트의 테스트는 함께 지운다).
