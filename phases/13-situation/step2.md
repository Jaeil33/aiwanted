# Step 2: pa-session

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(확률 headline, 상태 관리), `/docs/ADR.md`(ADR-013, ADR-016, ADR-019)
- `src/game/session.ts`와 테스트, `src/game/selectors.ts`와 테스트, `src/engine/game.ts`(`gaugesAtCount`), `src/engine/playout.ts`(`expectedCounts`)
- `src/game/situation.ts`, `src/domain/format.ts`, `src/domain/events.ts`, `src/types/domain.ts`
- `phases/13-situation/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/game/paSession.ts` (순수 reducer)
```ts
export interface PaPlay {
  balls: number; strikes: number;
  pitches: PitchSample[];
  status: 'ready' | 'animating' | 'done';
  outcome: { event: EventIndex; headline: string; state: GameState } | null;
}
export interface PaSessionState {
  situation: Situation | null;
  seed: number;
  tmis: TmiEntry[];
  interpreting: boolean;
  notice: string;
  providerDisabled: boolean;
  verdicts: Record<string, VerdictResult>;
  judgingId: string | null;
  play: PaPlay;
}
export type PaSessionAction =
  | { type: 'openSituation'; situation: Situation; seed: number; tmis?: TmiEntry[] }
  | { type: 'interpretStart' }
  | { type: 'interpretDone'; entry: TmiEntry; note: string; disableProvider: boolean }
  | { type: 'interpretFailed'; note: string }
  | { type: 'removeTmi'; id: string }
  | { type: 'judgeStart'; id: string }
  | { type: 'judgeDone'; id: string; verdict: VerdictResult; note: string; disableProvider: boolean }
  | { type: 'animationStart' }
  | { type: 'pitchApplied'; code: PitchCode; balls: number; strikes: number }
  | { type: 'paDone'; event: EventIndex; headline: string; state: GameState }
  | { type: 'resetPlay'; seed: number };
export function paSessionReducer(s: PaSessionState, a: PaSessionAction): PaSessionState;
export function canEditTmi(s: PaSessionState): boolean; // 상황이 있고 status 'ready'이고 던진 공이 없을 때
```
- `openSituation`은 play를 상황 count로 초기화한다.
- **거부된 해석(`refused: true`)은 `tmis`에 넣지 않고 notice만 바꾼다**(ADR-013, 2026-09-15 감사에서 발견한 버그).
- TMI 최대 3개는 이 파일의 상수 하나(`MAX_TMIS`)로만 둔다.
- `resetPlay`는 TMI·판정은 두고 play만 처음 상태로.

### `src/game/headline.ts` (순수 selectors)
```ts
export interface OddsHeadline { kind: 'actual' | 'onBase'; event: EventIndex | null; label: string; base: number; tmi: number; deltaPp: number }
export function oddsHeadline(situation: Situation, setup: SituationSetup, baseDist: EventVector, tmiDist: EventVector): OddsHeadline;
export function thousandSplit(dist: EventVector): number[];  // 길이 7, 합 1000, 최대 잔여법(동률은 사건 순서)
export function winLine(setup: SituationSetup, base: Gauges, tmi: Gauges): { team: string; base: number; tmi: number; deltaPp: number };
export function toonLine(headline: OddsHeadline, toonDist: EventVector): { value: number; deltaPp: number };
export function gradeOf(tmis: TmiEntry[]): Evidence | null; // 여러 TMI면 가장 약한 등급(상상 < 그럴듯함 < 실측)
```
- 라벨: `actual`이면 "<타자 이름> <사건 이름> 확률"(사건 이름: 삼진·볼넷·홈런·3루타·2루타·1루타·범타), 아니면 "<타자 이름> 출루 확률".
- `winLine`의 값은 공격 팀 승리 + 무승부/2.
- 테스트: 픽스처 분포로 각 사건, 출루 계산, 합 1000 불변식(무작위 분포 500개, 시드 난수를 인자로), 반올림 경계, 등급 순서.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트: 순수 모듈인가? 숫자는 엔진 분포에서만 오는가? 기존 `session.ts`·화면을 건드리지 않았는가?
3. `phases/13-situation/index.json`의 step 2를 업데이트한다.

## 금지사항

- 기존 `session.ts`·`GameProvider`를 바꾸지 마라. 이유: 16-broadcast-ui가 새 reducer로 한 번에 옮긴다.
- 확률을 근사하거나 표본으로 만들지 마라. 이유: ADR-002.
