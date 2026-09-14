# 프로젝트: TMI 야구

실제 KBO 명장면에 쓸데없는 TMI를 걸면 AI가 그 말을 야구 변수로 번역하고, 확률 엔진이 타석·이닝·경기 승률 변화를 정확히 계산하고, 투수와 타자가 그 장면을 다시 치르는 휴대폰용 웹 게임.

## 기술 스택
- Vite 8 + React 19 + TypeScript 6.0 (strict)
- 스타일: CSS Modules + `src/styles/tokens.css` (Tailwind 없음)
- 테스트: Vitest 5 + Testing Library + jsdom, Python은 pytest (`.venv`)
- 데이터 파이프라인: Python 3.13 + numpy (`pipeline/`)
- 배포: 정적 번들 + 서버리스 함수 `api/`(Claude API 프록시). 미리보기는 단일 HTML 아티팩트

## 아키텍처 규칙
- CRITICAL: 확률 숫자는 항상 `src/engine`이 계산한다. AI는 문장을 조절값으로 번역하고 설명만 한다. AI 응답에 담긴 숫자를 확률로 쓰지 마라.
- CRITICAL: AI 응답은 `src/ai/normalize.ts` 검증을 통과해야 엔진에 들어간다. 검증 실패·오류·AI 없음이면 `src/ai/rules.ts` 규칙 해석으로 대신한다.
- CRITICAL: `src/engine`, `src/stage/math`, `src/game`, `src/ai`(단 `src/ai/providers` 제외)는 순수 모듈이다. DOM, `window`, `fetch`, 타이머, `Math.random`을 직접 쓰지 마라. 난수는 인자로 받는다.
- CRITICAL: `data/`(네이버·Open-Meteo 원자료와 생성물)는 절대 커밋하지 않는다. 테스트는 `src/test/fixtures`, `pipeline/tests/fixtures`의 합성 데이터만 쓴다.
- CRITICAL: API 키는 `api/` 함수에서 환경변수로만 읽는다. 클라이언트 코드·저장소·로그에 키를 넣지 마라.
- 실존 선수에 대한 범죄·음주·도박·폭력·질병·부상·사망·사생활·성적 내용·비하 TMI는 계산하지 않고 거부한다.
- 확률을 보여주는 곳에는 근거 등급(실측/그럴듯함/상상)과 모드(현실/만화) 라벨을 함께 둔다.
- 의존성은 ADR-007 목록만 쓴다. 새 패키지가 필요하면 설치하지 말고 step을 blocked로 보고한다.
- `reference/tmi-prototype/`는 이식 참고용이다. 수정하거나 import하지 마라.
- `docs/design/nightgame/`은 UI 시각 기준 시안이다(ADR-011). 앱 코드에서 import하지 말고 토큰·구성·동작만 옮겨라.
- 공용 타입은 `src/types/`, 런타임 상수는 `src/domain/`에 둔다. 실측 변수 정의의 원본은 `src/domain/measured.json` 하나다(TS와 Python이 함께 읽는다).

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, test:, chore:)
- 테스트 말뭉치·픽스처에 실존 선수 이름과 민감한 문장을 함께 쓰지 마라. 이유: 공개 저장소다. 가상 이름(예: 김타자, 박투수)을 쓴다.
- Windows 환경이다. Python은 `.venv/Scripts/python`으로 실행하고, 셸 명령은 Git Bash 문법을 쓴다.

## 명령어
npm run dev             # 개발 서버
npm run build           # 타입 검사 + 프로덕션 빌드
npm run build:artifact  # 단일 HTML 빌드 (dist-artifact/index.html)
npm run lint            # ESLint
npm run test            # Vitest + pytest(pipeline, scripts)
npm run data            # 파이프라인: data/raw → data/build
