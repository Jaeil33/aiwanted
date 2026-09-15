# Step 3: vercel-output

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`(서버 함수, 데이터 흐름 서버리스), `/docs/ADR.md`(ADR-017, ADR-024)
- `api/*.ts`(interpret·verdict·games·game), `api/_lib/`
- `scripts/vite-api-dev.ts`와 테스트(step 2의 `toWebRequest`·`writeWebResponse`)
- `vite.config.ts`, `vercel.json`, `package.json`, `tsconfig.node.json`
- `phases/14-live-data/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (2026-09-15 운영 확인)

- 배포된 `POST https://aiwanted.vercel.app/api/interpret`가 `500 FUNCTION_INVOCATION_FAILED`였다. 저장소가 ESM(`"type": "module"`)이라 Vercel Node 런타임이 확장자 없는 상대 import(`./_lib/handlers`, `../../src/ai/normalize`)와 JSON import를 풀지 못한다. `/api/game`도 `src/live`를 import하므로 같은 이유로 죽는다.
- 실험: `npx vite build --ssr api/interpret.ts --outDir <임시>` → 모듈 12개가 import 없는 ESM 한 파일(32KB)이 됐고, Node에서 `import()` 후 `POST({}) → 400`으로 정상 동작했다.
- Vercel Build Output API v3: `.vercel/output/static/`(정적 파일, 루트에 그대로), `.vercel/output/functions/api/<name>.func/`(주소 `/api/<name>`) 안에 `.vc-config.json` 필수. Node 설정 키: `runtime`("nodejs22.x"), `handler`(시작 파일), `launcherType`("Nodejs"), `maxDuration`, `regions`, `memory`, `supportsResponseStreaming`, `shouldAddHelpers`. `.vercel/output/config.json`은 `{ "version": 3, "routes": [...] }`.

## 작업

### `scripts/vercelOutput.ts` (순수 도우미, 테스트 먼저 `scripts/vercelOutput.test.ts`)
```ts
/** api 폴더 파일 이름 목록 → 함수 이름(확장자 없음). *.test.ts, _로 시작하는 파일·폴더, .d.ts는 뺀다 */
export function functionNames(files: string[]): string[];
/** .vc-config.json 내용: nodejs22.x · handler index.mjs · launcherType Nodejs · regions ['icn1'] · maxDuration(verdict 60, 그 밖 20) */
export function vcConfig(name: string): Record<string, unknown>;
/** config.json: /assets/* 에 immutable 캐시 헤더(continue) 뒤 { handle: 'filesystem' } */
export function outputConfig(): { version: 3; routes: unknown[] };
/** 함수마다 번들할 가상 진입 파일 소스: api 모듈의 GET/POST/... export를 Node (req, res) 기본 export 어댑터로 감싼다 */
export function adapterEntrySource(apiModulePath: string, adapterModulePath: string): string;
```
- 어댑터 동작: `req.method`에 맞는 export가 있으면 `toWebRequest(req)`로 Web `Request`를 만들어 부르고 `writeWebResponse(res, response)`로 쓴다. 없으면 405와 `Allow` 헤더(있는 메서드 목록). 처리 중 예외는 500 `{ "error": "internal" }` + `Cache-Control: no-store`이고 예외 메시지·스택·환경변수를 응답에 넣지 않는다.
- `toWebRequest`는 `x-forwarded-proto`·`host`로 절대 URL을 만들고 IP 제한용 `x-forwarded-for`를 보존한다(step 2 함수가 그렇지 않으면 이 step에서 고치고 테스트한다).

### `scripts/build-vercel.ts`
- 순서: `dist/`가 없으면 실패 → `.vercel/output` 비우기 → `dist/`를 `.vercel/output/static/`에 복사 → `api/`의 함수마다 가상 진입 파일을 만들어 Vite `build()` API(SSR, format es, 한 파일, `node:` 내장 모듈만 external)로 `.vercel/output/functions/api/<name>.func/index.mjs`에 번들 → `.vc-config.json` 쓰기 → `config.json` 쓰기.
- 번들 검사: 결과 파일에 상대 경로 `import`/`require`가 남으면 실패, 함수당 1MB 넘으면 실패, `data/raw` 경로 문자열이 들어가면 실패. 함수 이름·크기를 한 줄씩 출력한다.
- 가상 진입 파일이 필요하면 `.vercel/tmp/` 아래에 만들고 끝나면 지운다.

### `scripts/smoke-vercel-output.ts`
- `.vercel/output/functions/api/*.func/index.mjs`를 하나씩 `import()`해 기본 export를 Node `http.createServer`에 붙이고(임시 포트) 네트워크 없이 확인한다:
  - `POST /api/interpret` 본문 `{}` → 400
  - `GET /api/game?id=bad` → 400, `GET /api/games?date=2026-13-40` → 400
  - `PUT /api/games` → 405 + `Allow`
  - 모든 응답이 JSON이고 본문에 `ANTHROPIC_API_KEY`·`KV_REST_API_TOKEN` 같은 환경변수 이름·값이 없다.
- 실패하면 exit 1. `.vercel/output`이 없으면 먼저 `npm run build:vercel`을 하라고 출력하고 exit 1.

### `package.json`
- `"build:vercel": "npm run build && tsx scripts/build-vercel.ts"`
- `"check:vercel": "tsx scripts/smoke-vercel-output.ts"`
- `build`·`test` 스크립트는 바꾸지 않는다.

### `vercel.json`
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": "npm run build:vercel",
  "outputDirectory": "dist"
}
```
- `outputDirectory: dist`는 Vercel이 `.vercel/output`을 쓰지 않을 때 정적 사이트라도 뜨게 하는 대비책이다. `functions`·`regions` 키는 넣지 않는다(함수 설정은 `.vc-config.json`이 맡는다).

### 문서
- `README`나 `CLAUDE.md` 명령어 목록에 `npm run build:vercel`·`npm run check:vercel` 한 줄씩(이미 있으면 확인만).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run build:vercel
npm run check:vercel
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `.vercel/output/functions/api/`의 `.func` 폴더 목록과 각 `index.mjs` 크기, `grep -c "from '\./\|from \"\.\./" index.mjs` 결과(0이어야 함)를 summary에 적는다.
3. 체크리스트: `.vercel/`이 git에 들어가지 않는가(`.gitignore`)? 키·토큰을 번들·로그·응답에 넣지 않았는가? 새 패키지를 설치하지 않았는가?
4. `phases/14-live-data/index.json`의 step 3과 `phases/index.json`의 14-live-data 상태를 업데이트한다.

## 금지사항

- 새 npm 패키지(esbuild 직접 의존, @vercel/node, vite-plugin-vercel 등)를 설치하지 마라. 이유: ADR-007. Vite `build()` API로 충분하다.
- `src/`의 import 경로에 `.js` 확장자를 일괄로 붙이지 마라. 이유: 병렬 phase와 충돌하고, 번들로 해결한다(ADR-024).
- Vercel CLI로 배포하거나 push하지 마라. 이유: 배포는 main 병합 뒤 GitHub 연동으로 한다.
- 기존 테스트를 깨뜨리지 마라.
