# Step 1: pitch-samples

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(데이터 흐름), `/docs/ADR.md`(ADR-018, ADR-021)
- `pipeline/tmi_pipeline/snapshot.py`(투구 표본), `relay.py`(`pitch_row`)와 테스트
- `src/data/appData.ts`와 테스트, `src/game/playback.ts`(`pickPitchRow`, `rowsForPitcher`)
- `phases/15-data-v2/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `snapshot.py` 투구 표본
- `byPitcher`: 수집한 중계에 투구 추적 행이 있는 모든 투수. 투수당 최대 48행, 층화 추출: 카운트 묶음(0-0 / 타자 유리 / 투수 유리 / 2스트라이크) × 결과 코드(B·T·S·F·X)가 가능한 한 고르게 남도록 결정적으로 고른다(시드 고정).
- `pools.L`·`pools.R`: 투수 손별 리그 표본 각 최대 600행, 같은 층화.
- 크기 예산: `pitches.json` 1.2MB 이하(넘으면 build 실패).

### `src/data/appData.ts`
- `loadPitchData(): Promise<PitchData | null>`: `import.meta.glob('../../data/build/app/pitches.json', { import: 'default' })`(지연)로 불러 검증한다. 파일이 없거나 틀리면 null.
- `APP_DATA.pitches`(즉시 로드)는 16-broadcast-ui가 지연 로더로 옮길 때까지 그대로 둔다.

### 테스트
- pytest: 층화 결과가 결정적, 행 수 상한, 적은 투수는 전부, 크기 예산.
- vitest: `loadPitchData` 성공·없음·모양 오류(glob 결과를 주입할 수 있게 내부 함수로 나눈다).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(worktree면 `TMI_RAW_DIR` 규칙).
2. summary에 투수 수·pitches.json 크기(원본·gzip)를 적는다.
3. `phases/15-data-v2/index.json`의 step 1을 업데이트한다.

## 금지사항

- `data/`를 커밋하지 마라.
- `Math.random`으로 표본을 고르지 마라. 이유: 빌드마다 결과가 달라진다.
