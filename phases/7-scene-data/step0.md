# Step 0: relay-fixes

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (데이터 흐름)
- `/docs/ADR.md` (ADR-004, ADR-005, ADR-014)
- `pipeline/tmi_pipeline/relay.py`, `pipeline/tests/test_relay.py`, `pipeline/tests/fixture_games.py`, `pipeline/tests/fixtures/`
- 원자료 구조 확인용(읽기만): `data/raw/naver/relay/`의 경기 파일 하나. git worktree에서는 `C:/Users/김재일/Desktop/aiwanted/data/raw/naver/relay/`를 읽는다.

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (2026-09-15 감사로 확인된 사실)

- 투수 교체 직후 타석에서 `relay.py`가 교체 전 투수를 기록한다. 예: 경기 `20260818WOLT02026`, 7회말 2사 1·2루(8:7) 타석의 첫 투구 `currentGameState.pitcher`는 76118인데 56337이 기록된다. 원자료 타석 10,999개 중 1,000개가 같은 문제다.
- 대타 교체용 빈 타석(투구·결과 옵션 없음) 435개가 타석으로 세어진다.
- "낫 아웃" 문장 201건이 인플레이 아웃으로 분류된다.
- 결과 옵션이 없는 미완료 타석 40개가 완료로 취급된다.
- 교체 옵션(textOptions type 2)의 `outPlayerTurn % 10`이 타순 슬롯(1~9)이다. 교체 1,195건 중 1,178건에서 확인됐다. 0이면 타순 밖(투수 교체 등)이다.

## 작업

### `pipeline/tmi_pipeline/relay.py`
1. `PlateAppearance`에 필드를 더한다(기존 필드 이름은 바꾸지 않는다):
   - `pitcher_id: str` — 첫 투구 옵션(type 1)의 `currentGameState.pitcher`. 투구가 없으면 기존 방식 값.
   - `pitcher_ids: list[str]` — 타석 안 투구마다의 투수 id를 순서대로, 연속 중복 없이.
   - `complete: bool` — 결과 옵션(type 13 또는 23)이 있으면 True.
2. `plate_appearances(game)`는 투구 옵션도 결과 옵션도 없는 타석을 건너뛴다.
3. `event_of(text)`는 "낫 아웃"이 들어간 문장을 삼진 사건(K)으로 분류한다. 낫 아웃으로 출루한 경우도 K로 두고, 엔진 사건 벡터에 없는 한계라고 주석으로 적는다.
4. 교체 기록:
   ```python
   @dataclass(frozen=True)
   class Substitution:
       seq: int            # 경기 안 시간 순서
       inning: int
       half: int           # 0 초, 1 말
       side: str           # "away" | "home" — 교체가 일어난 팀
       slot: int | None    # 1~9, 타순 밖이면 None
       in_id: str
       out_id: str
       kind: str           # "pinch_hitter" | "pinch_runner" | "defense" | "pitcher" | "other"

   def substitutions(game: dict) -> list[Substitution]: ...
   ```
   원자료에서 교체 옵션의 실제 키 이름(선수 id, 들어온·나간 선수, `outPlayerTurn`, 교체 종류 문장)을 먼저 확인하고 그대로 쓴다. 종류는 교체 문장의 단어(대타, 대주자, 투수, 수비 위치)로 정한다.

### 테스트 (`pipeline/tests/`)
- 합성 경기 픽스처에 아래 경우를 더한다.
  - 교체 직후 첫 투구에서 투수가 바뀐 타석
  - 타석 도중 투수가 바뀐 타석(`pitcher_ids` 2개)
  - 빈 대타 타석
  - 낫 아웃
  - 미완료 타석
  - 교체 옵션 4종(대타·대주자·수비·투수, `outPlayerTurn` 포함)
- 선수 id와 이름은 가상 값을 쓴다.

## Acceptance Criteria

```bash
npm run test:py
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 원자료로 확인한다(읽기만, git worktree면 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`). 아래 네 개수를 summary에 적는다.
   - 첫 투구 투수가 기존 값과 다른 타석
   - 건너뛴 빈 타석
   - K로 바뀐 낫 아웃
   - 교체 기록 수와 slot이 있는 교체 수
3. 아키텍처 체크리스트를 확인한다.
   - `relay.py` 밖을 고치지 않았는가?
   - 기존 필드 이름을 유지했는가?
   - 픽스처에 실존 선수 이름이 없는가?
4. `phases/7-scene-data/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- `data/`를 커밋하지 마라. 이유: 원자료 권리(ADR-005).
- 픽스처에 실존 선수 이름이나 실제 선수 id를 쓰지 마라. 이유: 공개 저장소.
- `snapshot.py`, `trust_states.py`를 고치지 마라. 이유: 다음 step의 범위다.
- 기존 테스트를 깨뜨리지 마라.
