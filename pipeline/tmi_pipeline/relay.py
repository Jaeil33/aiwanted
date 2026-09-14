"""네이버 문자중계(relay) 원자료를 타석·투구 단위로 읽는다. reference/tmi-prototype/build_data.py에서 이식.

relay 파일은 `{"game": {...}, "textRelays": [...]}`이고 textRelays 순서는 섞여 있으므로
항상 textOption `seqno`로 시간순을 다시 만든다.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from .contract import PITCH_RESULT_CODE, PITCH_TYPES
from .io import load_json

# 옵션마다 붙은 선수 누적 기록 묶음. 파이프라인이 쓰지 않고 원자료 크기의 약 3/4이라 읽을 때 버린다.
HEAVY_OPTION_KEYS = ("currentPlayersInfo",)

# textOption type
INNING_HEADER = 0
PITCH = 1
BATTER_INTRO = 8
RESULT_TYPES = (13, 23)
NOTE_TYPES = (14, 24)

# 스트라이크 카운트를 올리는 결과(2스트라이크 파울은 그대로)
STRIKE_RESULTS = ("T", "S", "V", "F", "W")

# PitchRow 7~16번째 값(PTS 운동 방정식 계수와 스트라이크존)
PTS_FIELDS = ("x0", "z0", "vx0", "vy0", "vz0", "ax", "ay", "az", "topSz", "bottomSz")

# 결과 문장 → 사건 인덱스(contract.EVENT_ORDER). 먼저 걸리는 키워드를 쓴다.
EVENT_KEYWORDS = (
    ("삼진", 0), ("볼넷", 1), ("고의4구", 1), ("몸에 맞는", 1),
    ("홈런", 2), ("3루타", 3), ("2루타", 4), ("1루타", 5), ("안타", 5),
)
OUT_EVENT = 6
HOME_RUN = 2


def _num(value) -> float:
    return float(value or 0)


def load_game(path: Path | str) -> dict:
    """relay 경기 파일을 읽고 쓰지 않는 무거운 옵션 필드(HEAVY_OPTION_KEYS)를 버린다."""
    game = load_json(path)
    for item in game.get("textRelays") or []:
        for t in item.get("textOptions") or []:
            for key in HEAVY_OPTION_KEYS:
                t.pop(key, None)
    return game


def chrono(game: dict) -> list[dict]:
    """textOptions가 있는 relay를 첫 seqno 순으로."""
    relays = [r for r in game.get("textRelays") or [] if r.get("textOptions")]
    return sorted(relays, key=lambda r: min(t.get("seqno", 0) for t in r["textOptions"]))


def sorted_options(relay: dict) -> list[dict]:
    """한 relay의 textOptions를 seqno 순으로."""
    return sorted(relay.get("textOptions") or [], key=lambda t: t.get("seqno", 0))


def walk_pitches(opts: list[dict], pts_by_id: dict[str, dict]) -> Iterator[tuple[dict, dict | None, int, int]]:
    """한 타석의 투구마다 (textOption, PTS 또는 None, 던지기 전 볼, 던지기 전 스트라이크)를 낸다."""
    balls = strikes = 0
    for t in opts:
        result = t.get("pitchResult")
        if t.get("type") != PITCH or result not in PITCH_RESULT_CODE:
            continue
        yield t, pts_by_id.get(t.get("ptsPitchId")), balls, strikes
        if result == "B":
            balls = min(balls + 1, 3)
        elif result in STRIKE_RESULTS:
            strikes = min(strikes + 1, 2)


def pitch_row(t: dict, p: dict, balls: int, strikes: int) -> list:
    """`src/types/data.ts` PitchRow: [type, speed, code, balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]."""
    stuff = t.get("stuff")
    kind = PITCH_TYPES.index(stuff) if stuff in PITCH_TYPES else PITCH_TYPES.index("기타")
    return [
        kind,
        int(_num(t.get("speed"))),
        PITCH_RESULT_CODE[t["pitchResult"]],
        balls,
        strikes,
        0 if p.get("stance") == "L" else 1,
        *(round(float(p[k]), 3) for k in PTS_FIELDS),
    ]


def event_of(text: str) -> int:
    """결과 문장의 사건: 삼진 0, 볼넷·고의4구·몸에 맞는 공 1, 홈런 2, 3루타 3, 2루타 4, 안타 5, 나머지 6."""
    for keyword, event in EVENT_KEYWORDS:
        if keyword in text:
            return event
    return OUT_EVENT


def bases_of(state: dict) -> int:
    """currentGameState의 base1..3(빈 루는 "0")을 비트마스크(1루=1, 2루=2, 3루=4)로."""
    return sum(1 << i for i in range(3) if state.get(f"base{i + 1}") not in ("0", "", None))


def valid_home_wp(metric: dict | None) -> float | None:
    """네이버 홈 승리확률(0~1). 홈+원정 합이 99~101이 아니면 무효(None)."""
    if not metric:
        return None
    home, away = metric.get("homeTeamWinRate"), metric.get("awayTeamWinRate")
    if home is None or away is None or not 99 <= home + away <= 101:
        return None
    return home / 100


@dataclass
class PlateAppearance:
    game_id: str
    index: int
    inning: int
    half: int
    side: str
    batter_id: str
    batter_name: str
    bat_order: int
    hit_type: str
    # 타석 시작 상태: inning, half, outs, bases, away, home
    state: dict
    pitcher_id: str
    options: list[dict]
    pts_by_id: dict[str, dict]
    result_text: str
    runs_in: int
    event: int
    # 타석이 끝난 뒤 네이버 홈 승리확률(0~1), 무효면 None
    wp_home_after: float | None
    # 네이버 wpaByPlate(%p), 승리확률이 무효면 None
    wpa: float | None


def plate_appearances(game: dict) -> list[PlateAppearance]:
    """타자 소개(type 8 + batterRecord)가 있는 relay만 시간순으로 타석으로 읽는다."""
    game_id = (game.get("game") or {}).get("gameId", "")
    out: list[PlateAppearance] = []
    for relay in chrono(game):
        opts = sorted_options(relay)
        head = next((t for t in opts if t.get("type") == BATTER_INTRO and t.get("batterRecord")), None)
        if head is None:
            continue
        record = head["batterRecord"]
        gs = head.get("currentGameState") or {}
        half = 1 if str(relay.get("homeOrAway")) == "1" else 0
        inning = int(relay["inn"])
        result_text = next((t.get("text") or "" for t in opts if t.get("type") in RESULT_TYPES), "")
        event = event_of(result_text)
        home_ins = sum(1 for t in opts if t.get("type") in NOTE_TYPES and "홈인" in (t.get("text") or ""))
        metric = relay.get("metricOption")
        wp = valid_home_wp(metric)
        out.append(PlateAppearance(
            game_id=game_id,
            index=len(out),
            inning=inning,
            half=half,
            side="home" if half else "away",
            batter_id=str(record.get("pcode")),
            batter_name=record.get("name") or "",
            bat_order=int(record.get("batOrder") or 0),
            hit_type=record.get("hitType") or "",
            state={
                "inning": inning,
                "half": half,
                "outs": int(_num(gs.get("out"))),
                "bases": bases_of(gs),
                "away": int(_num(gs.get("awayScore"))),
                "home": int(_num(gs.get("homeScore"))),
            },
            pitcher_id=str(gs.get("pitcher") or ""),
            options=opts,
            pts_by_id={p["pitchId"]: p for p in relay.get("ptsOptions") or []},
            result_text=result_text,
            runs_in=home_ins + (1 if event == HOME_RUN else 0),
            event=event,
            wp_home_after=wp,
            wpa=metric.get("wpaByPlate") if wp is not None else None,
        ))
    return out
