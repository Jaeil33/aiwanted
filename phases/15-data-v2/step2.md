# Step 2: matchup-index

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(상황 `MatchupIndex`), `/docs/ADR.md`(ADR-016, ADR-021), `/docs/UI_GUIDE.md`(매치업 찾기)
- `pipeline/tmi_pipeline/relay.py`, `build.py`, `contract.py`와 테스트
- `src/types/data.ts`, `src/data/appData.ts`, `src/test/fixtures/live.ts`(`fixtureMatchupIndex`)
- `phases/15-data-v2/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `pipeline/tmi_pipeline/matchups.py`
- 수집한 모든 중계(`data/raw/naver/relay/*.json`)의 타석을 `relay.py`로 걸어 `MatchupIndex`를 만든다: `games`(날짜 순), `rows`(`[games 인덱스, 타석 no, inning, half, batter, pitcher, event 또는 -1]`, no는 `src/live` 파서와 같은 순번), `range`(첫·마지막 경기 날짜), `generatedAt`.
- 끊긴 타석(`complete=False`)도 넣되 event는 -1.
- `build.py`가 `data/build/app/matchups.json`을 쓴다. 크기 예산 600KB.

### `src/data/matchups.ts` (순수)
```ts
export function loadMatchups(): Promise<MatchupIndex | null>;  // 지연 glob (내부 함수로 주입 가능하게)
export function searchMatchups(index: MatchupIndex, core: CoreData, q: { batter?: string; pitcher?: string; limit?: number }): MatchupHit[];
export interface MatchupHit { gameId: string; date: string; no: number; inning: number; half: Half; batter: string; pitcher: string; event: EventIndex | null }
export function suggestPlayers(core: CoreData, text: string, kind: 'H' | 'P', limit?: number): PlayerRecord[];
```
- 이름 검색: 공백 무시 부분 일치, 한글 초성 검색("ㄱㄷㅇ"), 같은 점수면 타석·이닝 많은 선수 먼저. 초성 분해 함수는 `src/domain`에 순수 함수로 둔다(이미 있으면 재사용).
- 결과는 최신 날짜 먼저, 기본 50개.

### 테스트
- pytest: 합성 중계 2경기로 색인 행·순번·event -1·범위·크기 예산.
- vitest: 부분 일치·초성·동명이인(팀 표시용 정보 유지)·타자만/투수만/둘 다·limit·빈 입력.
- 파서 일치: 같은 합성 경기를 `src/live` 파서로 읽은 타석 no와 색인 no가 같은지(14-live-data step 0 이후면 테스트, 아니면 summary에 남기고 18-release 점검 목록에 추가).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(worktree면 `TMI_RAW_DIR` 규칙).
2. summary에 색인 경기 수·행 수·matchups.json 크기를 적는다.
3. `phases/15-data-v2/index.json`의 step 2를 업데이트한다.

## 금지사항

- `data/`를 커밋하지 마라.
- 타석 번호 규칙을 파서와 다르게 만들지 마라. 이유: 매치업에서 고른 타석을 `/api/game`으로 열 때 어긋난다.
