# 프로젝트: TMI 야구

야구를 보다가(실시간 경기·지난 경기·직접 만든 상황) 방금 그 타석에 쓸데없는 TMI를 걸면 AI가 그 말을 야구 변수로 번역하고, 확률 엔진이 그 결과가 나올 확률과 경기 승률 변화를 정확히 계산하고, 그 타석을 다시 쳐보는 휴대폰용 웹 게임.

## 기술 스택
- Vite 8 + React 19 + TypeScript 6.0 (strict)
- 스타일: CSS Modules + `src/styles/tokens.css` (Tailwind 없음)
- 테스트: Vitest 5 + Testing Library + jsdom, Python은 pytest (`.venv`)
- 데이터 파이프라인: Python 3.13 + numpy (`pipeline/`)
- 배포: Vercel 정적 번들 + 서버리스 함수 `api/`(네이버 중계 프록시, Claude API 프록시, 인기 TMI 집계). 미리보기는 단일 HTML 아티팩트(실시간·집계 없음)

## 아키텍처 규칙
- CRITICAL: 확률 숫자는 항상 `src/engine`이 계산한다. AI는 문장을 조절값으로 번역하고 설명만 한다. AI 응답에 담긴 숫자를 확률로 쓰지 마라.
- CRITICAL: AI 응답은 `src/ai/normalize.ts` 검증을 통과해야 엔진에 들어간다. 검증 실패·오류·AI 없음이면 `src/ai/rules.ts` 규칙 해석으로 대신한다.
- CRITICAL: `src/engine`, `src/stage/math`, `src/game`, `src/ai`(단 `src/ai/providers` 제외), `src/live`(단 `src/live/providers` 제외)는 순수 모듈이다. DOM, `window`, `fetch`, 타이머, `Math.random`을 직접 쓰지 마라. 난수는 인자로 받는다.
- CRITICAL: `data/`(네이버·Open-Meteo 원자료와 생성물)는 절대 커밋하지 않는다. 예외는 앱 번들에 들어가는 `data/build/app/*.json`뿐이다(Vercel GitHub 빌드용, ADR-023). `data/raw`·`data/build`의 나머지는 커밋하지 마라. 테스트는 `src/test/fixtures`, `pipeline/tests/fixtures`의 합성 데이터만 쓴다.
- CRITICAL: API 키·저장소 토큰(`ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`)은 `api/` 함수에서 환경변수로만 읽는다. 클라이언트 코드·저장소·로그·응답에 넣지 마라.
- CRITICAL: 네이버 API는 `api/_lib/naver.ts`에서만 부른다. 브라우저에서 직접 부르지 말고, 원문 대신 `LiveGame`·`GameSummary` 요약만 돌려준다(ADR-017).
- 인기 TMI 집계에는 효과 키만 저장한다. TMI 문장·IP·기기 정보는 저장하지 마라(ADR-022).
- 실존 선수에 대한 범죄·음주·도박·폭력·질병·부상·사망·사생활·성적 내용·비하 TMI는 계산하지 않고 거부한다.
- 확률을 보여주는 곳에는 근거 등급(실측/그럴듯함/상상)을 함께 둔다. 만화 모드 값은 결과 카드의 한 줄에만 두고 모드 라벨을 붙인다(ADR-019).
- 의존성은 ADR-007 목록만 쓴다. 외부 서비스(Upstash 등)는 SDK 없이 REST(`fetch`)로 부른다. 새 패키지가 필요하면 설치하지 말고 step을 blocked로 보고한다.
- `reference/tmi-prototype/`는 이식 참고용이다. 수정하거나 import하지 마라.
- `docs/design/broadcast/`는 UI 시각 기준 시안이다(ADR-018). 앱 코드에서 import하지 말고 토큰·구성·동작만 옮겨라. `docs/design/nightgame/`은 폐기된 시안이다.
- 공용 타입은 `src/types/`, 런타임 상수는 `src/domain/`에 둔다. 실측 변수 정의의 원본은 `src/domain/measured.json` 하나다(TS와 Python이 함께 읽는다).

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, test:, chore:)
- 테스트 말뭉치·픽스처에 실존 선수 이름과 민감한 문장을 함께 쓰지 마라. 이유: 공개 저장소다. 가상 이름(예: 김타자, 박투수)을 쓴다.
- Windows 환경이다. Python은 `.venv/Scripts/python`으로 실행하고, 셸 명령은 Git Bash 문법을 쓴다.

## 명령어
npm run dev             # 개발 서버 (/api도 Vite 미들웨어로 함께 뜬다, 14-live-data 이후)
npm run build           # 타입 검사 + 프로덕션 빌드
npm run build:vercel    # build + api 함수 번들 → .vercel/output (Vercel 빌드 명령, ADR-024, 14-live-data step 3 이후)
npm run check:vercel    # .vercel/output 함수 번들 스모크 점검(네트워크 없음)
npm run build:artifact  # 단일 HTML 빌드 (dist-artifact/index.html)
npm run lint            # ESLint
npm run test            # Vitest + pytest(pipeline, scripts)
npm run collect         # 네이버 일정·중계 수집 → data/raw (15-data-v2 이후, 로컬 전용)
npm run data            # 파이프라인: data/raw → data/build
