"""네이버 문자중계(relay) 원자료를 타석·투구·교체 단위로 읽는다. reference/tmi-prototype/build_data.py에서 이식.

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
PLAYER_CHANGE = 2
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
STRIKEOUT = 0
OUT_EVENT = 6
HOME_RUN = 2
# 스트라이크 낫 아웃. 원자료에는 "낫 아웃"과 붙여 쓴 "낫아웃"이 섞여 있어 공백을 뺀 문장에서 찾는다.
DROPPED_THIRD_STRIKE = "낫아웃"

# 교체 종류: 교체 문장 "나간 위치 이름 : 들어온 위치 이름 (으)로 교체"의 들어온 위치 단어로 정한다.
PINCH_HITTER = "pinch_hitter"
PINCH_RUNNER = "pinch_runner"
PITCHER = "pitcher"
DEFENSE = "defense"
OTHER = "other"
KIND_BY_POSITION = {"대타": PINCH_HITTER, "대주자": PINCH_RUNNER, "투수": PITCHER}
DEFENSE_POSITIONS = ("포수", "1루수", "2루수", "3루수", "유격수", "좌익수", "중견수", "우익수", "지명타자")


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
    """결과 문장의 사건: 삼진 0, 볼넷·고의4구·몸에 맞는 공 1, 홈런 2, 3루타 3, 2루타 4, 안타 5, 나머지 6.

    스트라이크 낫 아웃("낫 아웃"·"낫아웃")은 타자가 1루에서 잡혔든 폭투·포일·실책으로 출루했든 삼진(0)이다.
    한계: 엔진 사건 벡터(K, BB, HR, 3B, 2B, 1B, OUT)에 '삼진 뒤 출루'가 없어서, 낫 아웃으로 출루한 타자도
    아웃된 삼진처럼 센다.
    """
    if DROPPED_THIRD_STRIKE in text.replace(" ", ""):
        return STRIKEOUT
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
    # 첫 투구(type 1)의 currentGameState.pitcher(ADR-014). 투수가 적힌 투구가 없으면 타자 소개 시점 투수.
    # 타자 소개 뒤에 투수 교체가 오면 소개에 적힌 투수는 바뀌기 전 투수라서 쓰지 않는다.
    pitcher_id: str
    # 타석 안 투구마다의 투수 id(시간순, 연속 중복 없이). 투수가 적힌 투구가 없으면 [pitcher_id].
    pitcher_ids: list[str]
    options: list[dict]
    pts_by_id: dict[str, dict]
    result_text: str
    # 결과 옵션(type 13·23)이 있으면 True. False면 result_text는 ""이고 event는 기본값(OUT)이다.
    complete: bool
    runs_in: int
    event: int
    # 타석이 끝난 뒤 네이버 홈 승리확률(0~1), 무효면 None
    wp_home_after: float | None
    # 네이버 wpaByPlate(%p), 승리확률이 무효면 None
    wpa: float | None


def _pitchers(opts: list[dict]) -> list[str]:
    """투구 옵션마다의 투수 id를 시간순으로, 연속 중복 없이. currentGameState에 투수가 없는 투구는 건너뛴다."""
    ids: list[str] = []
    for t in opts:
        if t.get("type") != PITCH:
            continue
        pitcher = str((t.get("currentGameState") or {}).get("pitcher") or "")
        if pitcher and (not ids or ids[-1] != pitcher):
            ids.append(pitcher)
    return ids


def plate_appearances(game: dict) -> list[PlateAppearance]:
    """타자 소개(type 8 + batterRecord)가 있는 relay를 시간순으로 타석으로 읽는다.

    투구도 결과도 없는 relay(타자 소개 뒤 대타 교체만 적힌 빈 타석 등)는 건너뛰고 index를 매기지 않는다.
    결과 없이 투구만 있는 타석(주루사로 이닝이 끝났거나 타석 도중 대타가 들어온 경우)은 complete False로 남긴다.
    """
    game_id = (game.get("game") or {}).get("gameId", "")
    out: list[PlateAppearance] = []
    for relay in chrono(game):
        opts = sorted_options(relay)
        head = next((t for t in opts if t.get("type") == BATTER_INTRO and t.get("batterRecord")), None)
        if head is None:
            continue
        has_pitch = any(t.get("type") == PITCH for t in opts)
        complete = any(t.get("type") in RESULT_TYPES for t in opts)
        if not has_pitch and not complete:
            continue
        record = head["batterRecord"]
        gs = head.get("currentGameState") or {}
        intro_pitcher = str(gs.get("pitcher") or "")
        pitcher_ids = _pitchers(opts) or ([intro_pitcher] if intro_pitcher else [])
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
            pitcher_id=pitcher_ids[0] if pitcher_ids else "",
            pitcher_ids=pitcher_ids,
            options=opts,
            pts_by_id={p["pitchId"]: p for p in relay.get("ptsOptions") or []},
            result_text=result_text,
            complete=complete,
            runs_in=home_ins + (1 if event == HOME_RUN else 0),
            event=event,
            wp_home_after=wp,
            wpa=metric.get("wpaByPlate") if wp is not None else None,
        ))
    return out


@dataclass(frozen=True)
class Substitution:
    seq: int            # 경기 안 시간 순서(교체 옵션의 seqno)
    inning: int
    half: int           # 0 초, 1 말
    side: str           # "away" | "home" — 교체가 일어난 팀
    slot: int | None    # 1~9, 타순 밖이면 None
    in_id: str
    out_id: str
    kind: str           # "pinch_hitter" | "pinch_runner" | "defense" | "pitcher" | "other"


def _slot(turn) -> int | None:
    """inPlayer.outPlayerTurn % 10이 타순(1~9). 0(투수 교체 등)이거나 값이 없으면 None."""
    try:
        slot = int(turn) % 10
    except (TypeError, ValueError):
        return None
    return slot if 1 <= slot <= 9 else None


def _change_kind(text: str, in_position: str) -> str:
    """교체 문장에서 들어온 선수 쪽(":" 뒤) 첫 단어로 종류를 정한다. ":"가 없으면 inPlayer.playerPos.

    선수 이름에 '대타' 같은 글자가 들어 있어도 위치 단어만 본다.
    """
    _, colon, incoming = text.partition(":")
    words = incoming.split() if colon else []
    position = words[0].split("(")[0] if words else in_position
    if position in KIND_BY_POSITION:
        return KIND_BY_POSITION[position]
    return DEFENSE if position in DEFENSE_POSITIONS else OTHER


def substitutions(game: dict) -> list[Substitution]:
    """교체 옵션(type 2) 중 들어온·나간 선수 id가 모두 있는 선수 교체를 시간순으로.

    원자료 키: playerChange.inPlayer·outPlayer의 playerId·playerPos, inPlayer.outPlayerTurn, 교체 문장 text(= liveText).
    수비 위치 변경(playerChange.type "shift", shiftPlayer만 있음)과 선수 id가 없는 문장 교체(type "text")는 뺀다.
    팀: 대타·대주자는 그 relay의 공격 팀, 투수·수비·기타 교체는 수비 팀
    (원자료 선수 교체 중 팀을 확인할 수 있는 2,267건 모두 선수가 타석·투구로 나온 팀과 같았다).
    """
    out: list[Substitution] = []
    for item in chrono(game):
        half = 1 if str(item.get("homeOrAway")) == "1" else 0
        batting, fielding = ("home", "away") if half else ("away", "home")
        for t in sorted_options(item):
            change = t.get("playerChange") or {}
            in_player = change.get("inPlayer") or {}
            out_player = change.get("outPlayer") or {}
            if t.get("type") != PLAYER_CHANGE or not in_player.get("playerId") or not out_player.get("playerId"):
                continue
            kind = _change_kind(t.get("text") or change.get("liveText") or "", in_player.get("playerPos") or "")
            out.append(Substitution(
                seq=int(t.get("seqno", 0)),
                inning=int(item["inn"]),
                half=half,
                side=batting if kind in (PINCH_HITTER, PINCH_RUNNER) else fielding,
                slot=_slot(in_player.get("outPlayerTurn")),
                in_id=str(in_player["playerId"]),
                out_id=str(out_player["playerId"]),
                kind=kind,
            ))
    return sorted(out, key=lambda sub: sub.seq)
