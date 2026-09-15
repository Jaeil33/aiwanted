# Step 0: artifact-bundle

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md`, `/docs/ARCHITECTURE.md`, `/docs/ADR.md` (특히 ADR-001, ADR-003, ADR-005, ADR-006, ADR-008, ADR-011~015), `/docs/UI_GUIDE.md`
- `phases/index.json`과 각 phase의 `index.json`(summary로 개발 과정·검증 수치 파악)
- `package.json`, `vite.config.ts`, `index.html`, `src/app/platform.ts`, `scripts/trust-report.ts`
- `phases/6-release/step1.md` (옛 번들 설계 — 요구는 여기서 옮긴다)

앱 데이터(`data/build/app/*.json`)가 없으면 `npm run data`와 `npm run trust`로 만든다. git worktree면 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `scripts/check-artifact.ts` (테스트 먼저 `scripts/check-artifact.test.ts`)
`checkArtifact(html: string, opts?: { maxBytes?: number }): { ok: boolean; bytes: number; problems: string[] }`, 기본 최대 15MB.

문제로 잡을 것:
- 외부 스크립트(`<script ... src=`)
- `fonts.googleapis.com`이 아닌 외부 스타일시트 링크
- "TMI 야구" 문구 없음
- 앱 데이터 없음: `countTable` 문자열과 네이버 경기 id 모양 `/\d{8}[A-Z]{4}\d{5}/`이 둘 다 있어야 한다. 번들러가 키 따옴표를 바꾸므로 따옴표로 판단하지 않는다.
- 결과를 드러내는 장면 id(`walkoff`, `끝내기` 같은 단어가 id 문자열에 있음)
- `sk-ant-` 또는 `ANTHROPIC_API_KEY` 문자열
- 크기 초과

CLI: `dist-artifact/index.html`을 검사해 결과를 출력하고, 문제가 있으면 exit 1이다. `package.json` scripts에 `"check:artifact": "tsx scripts/check-artifact.ts"`를 넣는다.

### `index.html` 메타
- `<meta name="description" content="실제 KBO 명장면에 쓸데없는 TMI를 걸면 타석·이닝·경기 승률이 어떻게 바뀌는지 계산하고 그 장면을 다시 치르는 게임">`
- `og:title` "TMI 야구", `og:description`(같은 문장)
- theme-color는 9-ui-system에서 넣은 값을 유지한다.

### `README.md` (저장소 루트, 한국어, 공개 저장소 방문자와 심사위원 대상)
- 한 줄 소개와 "쓸모없는 변수, 진짜 쓸모없을까?"
- 핵심 기능: PRD 1~8 요약. 나이트게임 화면, TMI 카드, 평행우주 1,000경기.
- 작동 방식: TMI → 입력 정리·안전 판정 → AI 해석(검증·복구, 없으면 규칙) → 엔진(타석 → 이닝 → 경기 정확 계산) → 중계 시점 연출. 흐름 그림은 코드 블록 ASCII.
- AI 활용: 해석·판정에만 쓰고 숫자는 엔진이 계산한다(ADR-003·013). 경로는 아티팩트 `sample`·배포 API·규칙 세 가지다(ADR-006).
- 검증(숫자는 모두 파일·summary에서 읽어 적고, 없으면 그 문단을 쓰지 않는다):
  - 엔진 테스트(정확 계산 = 시뮬레이션, 불변식)
  - 실측 변수 walk-forward 판정(`evidence.json`)
  - 엔진 신뢰도 Brier(`trust.json`)
  - 해석 말뭉치 수치(8-interpreter summary)
  - 2026-09-15 감사와 수정 내역(장면 투수·타선, 스포일러 제거, 숨은 탭 멈춤)
- 개발 과정: 하네스 프레임워크(CLAUDE.md·docs·phases), phase 목록, worktree 병렬 실행(ADR-008), TDD.
- 실행 방법: `npm install`, `.venv` 만들기, `npm run data`(원자료 필요 — 저장소에 없음), `npm run trust`, `npm run dev`, `npm run build:artifact`.
- 데이터와 권리: 네이버 스포츠(KBO) 비공식 데이터·Open-Meteo. 원자료·생성물은 커밋하지 않는다. 선수 사진·로고는 없다(ADR-005).
- 개인 정보(이름·이메일·팀원)는 쓰지 않는다.

### 최종 빌드
- `npm run build:artifact` → `npm run check:artifact`가 통과해야 한다. 결과 파일 크기를 summary에 적는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run build:artifact
npm run check:artifact
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 단일 HTML에 외부 스크립트가 없고 데이터가 들어 있는가?
   - README에 개인 정보·API 키·원자료가 없는가?
   - `git status`에 `data/`, `dist-artifact/`가 없는가?
3. `phases/12-release/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`(아티팩트 크기 포함)
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 배포(Vercel 등)·push·아티팩트 게시를 하지 마라. 이유: 계정과 공개 여부는 사용자가 정한다.
- `dist-artifact/`나 `data/`를 커밋하지 마라. 이유: 생성물·권리(ADR-005).
- README에 과장된 성능 주장이나 파일에 없는 숫자를 쓰지 마라. 이유: 제출물 허위 기재는 자격 상실 사유다.
- 기존 테스트를 깨뜨리지 마라.
