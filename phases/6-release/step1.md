# Step 1: artifact-bundle

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md`, `/docs/ARCHITECTURE.md`, `/docs/ADR.md`(ADR-001, ADR-005, ADR-006, ADR-008), `/docs/UI_GUIDE.md`
- `phases/index.json`과 각 phase의 `index.json`(summary로 개발 과정을 파악)
- `package.json`, `vite.config.ts`, `index.html`, `src/app/platform.ts`, `scripts/trust-report.ts`

앱 데이터(`data/build/app/*.json`)가 없으면 `npm run data`와 `npm run trust`로 만든다. git worktree에서는 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.

## 작업

### `scripts/check-artifact.ts` (테스트 먼저 `scripts/check-artifact.test.ts`)
- `checkArtifact(html: string, opts?: { maxBytes?: number }): { ok: boolean; bytes: number; problems: string[] }` — 기본 최대 15MB. 문제 목록:
  - 외부 스크립트(`<script ... src=`)가 있음
  - `fonts.googleapis.com`이 아닌 외부 스타일시트 링크
  - "TMI 야구" 문구 없음
  - 앱 데이터가 들어 있지 않음(`countTable` 문자열과 네이버 경기 id 모양 `/\d{8}[A-Z]{4}\d{5}/`이 둘 다 필요 — 번들러가 JSON을 문자열·객체 리터럴로 바꾸며 키 따옴표가 달라지므로 따옴표를 기준으로 삼지 않는다)
  - `sk-ant-` 또는 `ANTHROPIC_API_KEY` 문자열이 있음
  - 크기 초과
- CLI: `dist-artifact/index.html`을 검사해 결과를 출력하고 문제가 있으면 exit 1.
- `package.json` scripts에 `"check:artifact": "tsx scripts/check-artifact.ts"` 추가.

### `index.html` 메타
- `<meta name="description" content="실제 KBO 명장면에 쓸데없는 TMI를 걸면 타석·이닝·경기 승률이 어떻게 바뀌는지 계산하고 그 장면을 다시 치르는 게임">`, `theme-color` `#0A1520`, `og:title` "TMI 야구", `og:description`(같은 문장).

### `README.md` (저장소 루트)
한국어로, 공개 저장소 방문자와 심사위원이 읽는다고 생각하고 쓴다:
- 한 줄 소개와 "쓸모없는 변수, 진짜 쓸모없을까?"
- 핵심 기능(PRD 1~8 요약)
- 작동 방식: TMI → AI 번역(검증·규칙 대체) → 엔진(타석 → 이닝 → 경기 정확 계산) → 연출(실제 투구 궤적) 흐름 그림(코드 블록 ASCII)
- AI 활용: 해석·판정에만 Claude를 쓰고 숫자는 엔진이 계산한다는 원칙(ADR-003), 아티팩트·배포·규칙 세 경로(ADR-006)
- 검증: 엔진 테스트(정확 계산 = 시뮬레이션 등), 실측 변수 walk-forward 판정(ADR-004), 엔진 신뢰도(trust.json의 Brier 요약 — 숫자는 파일에서 읽어 적되, 파일이 없으면 이 문단을 쓰지 않는다)
- 개발 과정: 하네스 프레임워크(CLAUDE.md·docs·phases), phase 목록과 병렬 실행(ADR-008), TDD
- 실행 방법: `npm install`, `.venv` 만들기, `npm run data`(원자료 필요 — 원자료는 저장소에 없음), `npm run trust`, `npm run dev`, `npm run build:artifact`
- 데이터와 권리: 네이버 스포츠(KBO) 비공식 데이터·Open-Meteo, 원자료와 생성물은 커밋하지 않음, 선수 사진·로고 없음(ADR-005)
- 개인 정보(이름·이메일·팀원)는 쓰지 않는다.

### 최종 빌드
- `npm run build:artifact` → `npm run check:artifact` 통과. 결과 파일 크기를 summary에 적는다.

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
2. 아키텍처 체크리스트를 확인한다:
   - 단일 HTML에 외부 스크립트가 없고 데이터가 들어 있는가?
   - README에 개인 정보·API 키·원자료가 없는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`git status`에 `data/`, `dist-artifact/` 없음)
3. 결과에 따라 `phases/6-release/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`(아티팩트 크기 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 배포(Vercel 등)·push·아티팩트 게시를 하지 마라. 이유: 계정과 공개 여부는 사용자가 정한다.
- `dist-artifact/`나 `data/`를 커밋하지 마라. 이유: 생성물·권리(ADR-005).
- README에 과장된 성능 주장이나 파일에 없는 숫자를 쓰지 마라. 이유: 제출물 허위 기재는 자격 상실 사유다.
- 기존 테스트를 깨뜨리지 마라.
