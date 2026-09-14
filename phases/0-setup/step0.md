# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` (특히 ADR-001, ADR-007)
- `/docs/UI_GUIDE.md` (색상·타이포그래피 토큰)
- `/.gitignore`, `/.claude/settings.json`, `/scripts/hooks/tdd-guard.sh` (TDD 가드가 어떤 파일을 막는지)

지금 저장소에는 문서, 하네스(`scripts/execute.py`), 참고용 JS 프로토타입(`reference/tmi-prototype/`)만 있다. 이 step에서 앱과 파이프라인의 뼈대를 만든다.
TDD 가드 훅은 `.ts/.tsx/.js/.jsx` 파일을 쓰기 전에 같은 폴더에 `<이름>.test.ts(x)`가 있는지 검사한다. 항상 테스트 파일을 먼저 만들어라. `*.config.*`, `.json`, `.css`, `.md`, `src/types/`는 검사하지 않는다.

## 작업

### 1. npm 프로젝트
루트에 `package.json`을 만든다(`"name": "tmi-baseball"`, `"private": true`, `"type": "module"`). 의존성은 ADR-007 목록만 설치한다.

```bash
npm install react@^19.3.0 react-dom@^19.3.0
npm install -D vite@^8.3.0 @vitejs/plugin-react@^6.1.1 typescript@~6.0.3 vitest@^5.0.0 jsdom@^30.0.1 @testing-library/react@^16.3.3 @testing-library/dom@^10 @testing-library/jest-dom@^7.0.1 @testing-library/user-event@^14 eslint@^10.10.0 @eslint/js typescript-eslint@^8.70.0 eslint-plugin-react-hooks@^7.1.1 globals vite-plugin-singlefile@^2.3.3 tsx@^4.23.13 @types/react @types/react-dom @types/node
```

peer 의존성 충돌로 설치가 실패하면 버전 범위만 조정한다. 패키지를 바꾸거나 추가하지 마라.

`package.json`의 scripts는 정확히 아래와 같다:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "build:artifact": "tsc -b && vite build --mode artifact",
  "preview": "vite preview",
  "lint": "eslint .",
  "test": "vitest run && npm run test:py",
  "test:web": "vitest run",
  "test:py": "tsx scripts/run-python.ts -m pytest -q",
  "data": "tsx scripts/run-python.ts -m tmi_pipeline.build"
}
```

### 2. TypeScript·Vite·Vitest·ESLint 설정
- `tsconfig.json`: `"files": []`, references → `tsconfig.app.json`, `tsconfig.node.json`.
- `tsconfig.app.json`: include `["src"]`. `strict: true`, `jsx: "react-jsx"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `target: "ES2022"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `resolveJsonModule: true`, `noEmit: true`, `types: ["vite/client"]`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `skipLibCheck`. `noUncheckedIndexedAccess`는 켜지 않는다(엔진의 배열 인덱싱이 많다). `tsc -b`가 쓰는 `tsBuildInfoFile`은 `node_modules/.tmp/` 아래로 둔다.
- `tsconfig.node.json`: include `["vite.config.ts", "vitest.config.ts", "scripts/**/*.ts", "api/**/*.ts"]`, `types: ["node"]`, 같은 strict 옵션, `noEmit: true`.
- `vite.config.ts`: `base: './'`, `plugins: [react()]`. `mode === 'artifact'`이면 `viteSingleFile()`을 추가하고 `build.outDir = 'dist-artifact'`, `build.assetsInlineLimit = 100_000_000`, `build.cssCodeSplit = false`.
- `vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'api/**/*.test.ts']`, `exclude`에 `reference/**`, `node_modules/**`, `dist/**`, `dist-artifact/**`, `data/**`. 테스트는 `describe/it/expect`를 `vitest`에서 명시적으로 import한다(globals 끔).
- `eslint.config.js`(flat config): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks`의 recommended 규칙, `globals.browser`와 `globals.node`. ignores: `dist`, `dist-artifact`, `reference`, `data`, `.venv`, `coverage`, `phases`, `node_modules`.

### 3. 앱 뼈대
- `index.html`: `<html lang="ko">`, viewport meta, `<title>TMI 야구</title>`, Google Fonts `<link>`(Black Han Sans, IBM Plex Sans KR 400·500·600·700, VT323, `display=swap`), `<div id="root"></div>`, `<script type="module" src="/src/main.tsx"></script>`.
- `src/styles/tokens.css`: `docs/UI_GUIDE.md`의 색상 토큰 전부와 폰트 스택 `--display`, `--body`, `--led-font`를 `:root`에 정의한다.
- `src/styles/global.css`: box-sizing reset, `body { margin: 0; background: var(--night); color: var(--chalk); font: 400 15px/1.6 var(--body); }`, `:focus-visible { outline: 2px solid var(--led); outline-offset: 2px; }`, `@media (prefers-reduced-motion: reduce)`에서 transition·animation을 끈다.
- 테스트 먼저 `src/app/App.test.tsx`: 제목 "TMI 야구", 부제 "쓸모없는 변수, 진짜 쓸모없을까?", 푸터 출처 문구가 렌더된다.
- `src/app/App.tsx`: 임시 셸. `<header>`에 제목·부제, `<main>`에 "경기장을 준비하고 있어요", `<footer>`에 UI_GUIDE의 출처 문구. 화면 설계는 5-app phase의 일이므로 꾸미지 마라.
- 테스트 먼저 `src/main.test.tsx`: `mount(div)` 후 제목이 보이고, 돌려받은 함수를 부르면 div가 비워진다.
- `src/main.tsx`: `export function mount(el: HTMLElement): () => void` — `createRoot(el).render(<StrictMode><App /></StrictMode>)` 후 unmount 함수를 돌려준다. `tokens.css`, `global.css`를 import한다. 파일 끝에서 `document.getElementById('root')`가 있을 때만 `mount`를 호출한다.
- `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest'`.

### 4. Python 실행 도우미와 파이프라인 뼈대
- 테스트 먼저 `scripts/run-python.test.ts`, 그다음 `scripts/run-python.ts`:
  - `export function resolvePython(root: string, platform: NodeJS.Platform, exists: (p: string) => boolean): string | null` — win32면 `<root>/.venv/Scripts/python.exe`, 그 외 `<root>/.venv/bin/python`. 없으면 null.
  - `export function pythonEnv(root: string, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv` — `PYTHONUTF8=1`을 넣고 `PYTHONPATH` 앞에 `<root>/pipeline`을 붙인다(기존 값 유지, 구분자 `path.delimiter`).
  - 직접 실행될 때만(`import.meta.url === pathToFileURL(process.argv[1]).href`) 받은 인자로 python을 `stdio: 'inherit'`, cwd=root로 실행하고 종료 코드를 그대로 전달한다. python이 없으면 `.venv` 만드는 명령을 안내하고 exit 1.
- 루트 `pytest.ini`: `[pytest]`, `testpaths = pipeline/tests scripts`, `pythonpath = pipeline scripts`, `addopts = -p no:cacheprovider`.
- `pipeline/requirements-dev.txt`: `numpy`, `pytest` 두 줄.
- 테스트 먼저 `pipeline/tests/test_package.py`: `__version__` 문자열, `ROOT / "CLAUDE.md"` 존재, 환경변수 `TMI_RAW_DIR`를 주면 `RAW_DIR`가 그 경로가 된다(monkeypatch + `importlib.reload`).
- `pipeline/tmi_pipeline/__init__.py`: `__version__ = "0.1.0"`, `ROOT`(저장소 루트 `Path`), `RAW_DIR`(`TMI_RAW_DIR` 환경변수 또는 `ROOT / "data" / "raw"`), `BUILD_DIR = ROOT / "data" / "build"`.
- `.venv`가 없으면 만든다: `python -m venv .venv` 후 `.venv/Scripts/python -m pip install -r pipeline/requirements-dev.txt`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run build:artifact
node -e "const h=require('fs').readFileSync('dist-artifact/index.html','utf8'); if(!h.includes('TMI 야구')||/<script[^>]*\ssrc=/.test(h)){console.error('artifact is not a single file');process.exit(1)}"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR-007 의존성 목록을 벗어나지 않았는가? (`package.json` 확인)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`git status`에 `data/`, `.venv/`가 보이면 안 된다)
3. 결과에 따라 `phases/0-setup/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Next.js, Tailwind, 상태관리·차트·CSS-in-JS 라이브러리를 설치하지 마라. 이유: ADR-001, ADR-007.
- `docs/`, `CLAUDE.md`, `scripts/execute.py`, `scripts/test_execute.py`, `scripts/hooks/`, `reference/`를 수정하지 마라. 이유: 하네스 가드레일과 참고 원본이다.
- `data/`나 `.venv/`를 커밋하지 마라. 이유: CLAUDE.md CRITICAL, ADR-005.
- 화면 디자인, 엔진, 데이터 처리 코드를 만들지 마라. 이유: 이후 phase의 범위다.
- 기존 테스트를 깨뜨리지 마라.
