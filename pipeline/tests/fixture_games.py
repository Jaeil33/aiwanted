"""테스트용 합성 경기 도우미. pipeline/tests/fixtures의 합성 픽스처만 쓴다(원자료 금지)."""

import copy
import json
import shutil
from pathlib import Path

from tmi_pipeline import relay

FIXTURE_RAW = Path(__file__).parent / "fixtures" / "raw"
FIXTURE_GAME_ID = "20260815HTLT02026"


def load_fixture_game() -> dict:
    """원정 HT 대 홈 LT, 2이닝 27타석 픽스처 경기."""
    return json.loads((FIXTURE_RAW / "naver" / "relay" / f"{FIXTURE_GAME_ID}.json").read_text(encoding="utf-8"))


def shifted_game(base: dict, game_id: str, date: str, *, innings: int = 5, wpa_factor: float = 1.0, start: str = "18:00") -> dict:
    """픽스처 경기를 innings만큼 뒤 이닝으로 옮기고 gameId·날짜·시작 시각·wpa 크기를 바꾼 복사본.

    기본값이면 1·2회가 6·7회가 되어, 7회 타석은 양 팀 타순 1~9번이 모두 나온 뒤다.
    """
    game = copy.deepcopy(base)
    meta = game["game"]
    meta["gameId"] = game_id
    meta["gameDate"] = date
    meta["gameDateTime"] = f"{date}T{start}:00"
    for item in game["textRelays"]:
        item["inn"] += innings
        metric = item.get("metricOption") or {}
        if metric.get("wpaByPlate"):
            metric["wpaByPlate"] = round(metric["wpaByPlate"] * wpa_factor, 3)
    return game


def pa_relay(game: dict, index: int) -> dict:
    """index번째 타석(relay.plate_appearances 번호: 투구도 결과도 없는 빈 타석은 세지 않는다)의 원본 relay dict."""
    first = relay.plate_appearances(game)[index].options[0]
    return next(r for r in relay.chrono(game) if any(t is first for t in r["textOptions"]))


def make_raw_dir(root: Path, games: list[dict]) -> Path:
    """games를 naver/relay/<gameId>.json으로 쓰고 픽스처 시즌 기록을 복사한 원자료 폴더."""
    relay_dir = root / "naver" / "relay"
    relay_dir.mkdir(parents=True, exist_ok=True)
    for game in games:
        (relay_dir / f"{game['game']['gameId']}.json").write_text(json.dumps(game, ensure_ascii=False), encoding="utf-8")
    stats_dir = root / "naver" / "stats"
    stats_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted((FIXTURE_RAW / "naver" / "stats").glob("*.json")):
        shutil.copy(src, stats_dir / src.name)
    return root


# --- cases_game: 교체·빈 타석·낫 아웃·미완료 타석 사례 ------------------------------------------------

CASES_GAME_ID = "20260816HTLT02026"
INVALID_METRIC = {"homeTeamWinRate": 0.0, "awayTeamWinRate": 0.0, "wpaByPlate": 0.0}
PITCH_WORDS = {"B": "볼", "T": "스트라이크", "S": "헛스윙", "F": "파울", "H": "타격"}


def _gs(pitcher: str, batter: str, out: int, bases: str = "000", ball: int = 0, strike: int = 0) -> dict:
    """3회 currentGameState(점수는 원정 4 : 홈 5 그대로). bases는 1·2·3루 주자 표시 세 글자, '0'은 빈 루."""
    return {
        "homeScore": "5", "awayScore": "4", "homeHit": "0", "awayHit": "0", "pitcher": pitcher, "batter": batter,
        "strike": str(strike), "ball": str(ball), "out": str(out),
        "base1": bases[0], "base2": bases[1], "base3": bases[2],
    }


def _intro(kind: int, text: str, gs: dict, pcode: str, name: str, order: int, hit_type: str) -> dict:
    """타자 기록이 붙은 이닝 머리(type 0)나 타자 소개(type 8)."""
    record = {
        "pcode": pcode, "name": name, "batOrder": order, "hitType": hit_type, "posName": "지명타자",
        "pa": 1, "ab": 1, "hit": 0, "hr": 0, "bb": 0, "so": 0,
    }
    return {"type": kind, "text": text, "stuff": None, "currentGameState": gs, "batterRecord": record}


def _batter(order: int, pcode: str, name: str, hit_type: str, gs: dict) -> dict:
    return _intro(8, f"{order}번타자 {name}", gs, pcode, name, order, hit_type)


def _pitches(gs: dict, results: str, *, first: int = 1, ball: int = 0, strike: int = 0) -> list[dict]:
    """results 글자(B·T·S·F·H)마다 투구 옵션. currentGameState의 볼·스트라이크는 던진 뒤 값."""
    options = []
    for num, result in enumerate(results, start=first):
        if result == "B":
            ball += 1
        elif result in "TS" or (result == "F" and strike < 2):
            strike += 1
        options.append({
            "type": 1, "text": f"{num}구 {PITCH_WORDS[result]}", "pitchNum": num, "pitchResult": result,
            "speed": "140", "stuff": "직구", "currentGameState": {**gs, "ball": str(ball), "strike": str(strike)},
        })
    return options


def _change(text: str, gs: dict, incoming: tuple[str, str, str, int], outgoing: tuple[str, str, str]) -> dict:
    """교체 옵션(type 2). 원자료처럼 outPlayerTurn은 inPlayer에 있다. incoming = (이름, 위치, id, outPlayerTurn)."""
    in_name, in_pos, in_id, turn = incoming
    out_name, out_pos, out_id = outgoing
    return {
        "type": 2, "text": text, "stuff": None, "currentGameState": gs,
        "playerChange": {
            "liveText": text, "type": "substitution",
            "inPlayer": {"playerName": in_name, "playerPos": in_pos, "playerId": in_id, "outPlayerTurn": turn},
            "outPlayer": {"playerName": out_name, "playerPos": out_pos, "playerId": out_id},
        },
    }


def _text(kind: int, text: str, gs: dict) -> dict:
    """결과(13·23)나 주자(14·24) 문장."""
    return {"type": kind, "text": text, "stuff": None, "currentGameState": gs}


def _metric(home: float, wpa: float) -> dict:
    return {"homeTeamWinRate": home, "awayTeamWinRate": round(100 - home, 1), "wpaByPlate": wpa}


def _third_inning() -> list[tuple[str, int, dict, list[dict]]]:
    """cases_game이 픽스처 경기 뒤에 붙이는 3회 relay: (제목, homeOrAway, metricOption, textOptions)."""
    return [
        ("3회초 KIA 공격", 0, INVALID_METRIC, [
            _intro(0, "3회초 KIA 공격", _gs("hp2", "a5", 0), "a5", "원정타자5", 5, "우투우타"),
        ]),
        ("5번타자 원정타자5", 0, _metric(55.0, 3.7), [
            _batter(5, "a5", "원정타자5", "우투우타", _gs("hp2", "a5", 0)),
            _change("투수 홈투수2 : 투수 홈투수3 (으)로 교체", _gs("hp3", "a5", 0),
                    ("홈투수3", "투수", "hp3", 20), ("홈투수2", "투수", "hp2")),
            *_pitches(_gs("hp3", "a5", 0), "BTH"),
            _text(23, "원정타자5 : 중견수 앞 1루타", _gs("hp3", "a5", 0, "500")),
        ]),
        ("6번타자 원정타자6", 0, _metric(57.0, -2.0), [
            _batter(6, "a6", "원정타자6", "우투좌타", _gs("hp3", "a6", 0, "500")),
            _change("1루주자 원정타자5 : 대주자 원정대주자5 (으)로 교체", _gs("hp3", "a6", 0, "500"),
                    ("원정대주자5", "대주자", "a5r", 15), ("원정타자5", "지명타자", "a5")),
            *_pitches(_gs("hp3", "a6", 0, "500"), "BH"),
            _text(13, "원정타자6 : 유격수 땅볼 아웃 (유격수->1루수 송구아웃)", _gs("hp3", "a6", 1, "050")),
            _text(14, "1루주자 원정대주자5 : 2루까지 진루", _gs("hp3", "a6", 1, "050")),
        ]),
        ("7번타자 원정타자7", 0, _metric(60.0, -3.0), [
            _batter(7, "a7", "원정타자7", "우투우타", _gs("hp3", "a7", 1, "050")),
            *_pitches(_gs("hp3", "a7", 1, "050"), "TSS"),
            _text(13, "원정타자7 : 포수 스트라이크 낫 아웃 (포수->1루수 1루 터치아웃)", _gs("hp3", "a7", 2, "050")),
        ]),
        ("8번타자 원정타자8", 0, INVALID_METRIC, [
            _batter(8, "a8", "원정타자8", "좌투우타", _gs("hp3", "a8", 2, "050")),
            *_pitches(_gs("hp3", "a8", 2, "050"), "BT"),
            _text(14, "2루주자 원정대주자5 : 견제사 아웃 (투수->유격수 2루 터치아웃)", _gs("hp3", "a8", 3)),
        ]),
        ("3회말 롯데 공격", 1, INVALID_METRIC, [
            _intro(0, "3회말 롯데 공격", _gs("ap1", "h6", 0), "h6", "홈타자6", 6, "우투양타"),
        ]),
        ("6번타자 홈타자6", 1, INVALID_METRIC, [
            _batter(6, "h6", "홈타자6", "우투양타", _gs("ap1", "h6", 0)),
            _change("좌익수 원정타자7 : 좌익수 원정수비7 (으)로 교체", _gs("ap1", "h6", 0),
                    ("원정수비7", "좌익수", "a7d", 17), ("원정타자7", "좌익수", "a7")),
            _change("6번타자 홈타자6 : 대타 홈대타6 (으)로 교체", _gs("ap1", "h6b", 0),
                    ("홈대타6", "대타", "h6b", 16), ("홈타자6", "지명타자", "h6")),
        ]),
        ("6번타자 홈대타6", 1, _metric(64.0, 4.0), [
            _batter(6, "h6b", "홈대타6", "우투좌타", _gs("ap1", "h6b", 0)),
            *_pitches(_gs("ap1", "h6b", 0), "BT"),
            _change("투수 원정투수1 : 투수 원정투수2 (으)로 교체", _gs("ap2", "h6b", 0, ball=1, strike=1),
                    ("원정투수2", "투수", "ap2", 10), ("원정투수1", "투수", "ap1")),
            *_pitches(_gs("ap2", "h6b", 0), "BH", first=3, ball=1, strike=1),
            _text(23, "홈대타6 : 좌익수 앞 1루타", _gs("ap2", "h6b", 0, "600")),
        ]),
        ("7번타자 홈타자7", 1, _metric(58.0, -6.0), [
            _batter(7, "h7", "홈타자7", "우투좌타", _gs("ap2", "h7", 0, "600")),
            *_pitches(_gs("ap2", "h7", 0, "600"), "H"),
            _text(13, "홈타자7 : 유격수 땅볼 아웃 (유격수->2루수->1루수 병살)", _gs("ap2", "h7", 2)),
            _text(14, "1루주자 홈대타6 : 포스아웃 (유격수->2루수 2루 터치아웃)", _gs("ap2", "h7", 2)),
        ]),
        ("8번타자 홈타자8", 1, _metric(57.0, -1.0), [
            _batter(8, "h8", "홈타자8", "우투우타", _gs("ap2", "h8", 2)),
            *_pitches(_gs("ap2", "h8", 2), "TFS"),
            _text(13, "홈타자8 : 삼진 아웃", _gs("ap2", "h8", 3)),
        ]),
    ]


def cases_game(game_id: str = CASES_GAME_ID, date: str = "2026-08-16") -> dict:
    """픽스처 경기(1·2회, 타석 0~26) 뒤에 3회를 붙인 합성 경기. 교체는 원자료처럼 타자 소개 뒤에 온다.

    3회초(원정 HT 공격, 원정 4 : 홈 5)
      27 원정타자5  소개 뒤 투수 교체(홈투수2 → 홈투수3, outPlayerTurn 20), 첫 공부터 hp3, 중견수 앞 1루타
      28 원정타자6  소개 뒤 대주자 교체(1루주자 원정타자5 → 원정대주자5 a5r, 15 → 5번), 유격수 땅볼(주자 2루까지)
      29 원정타자7  포수 스트라이크 낫 아웃(1루 터치아웃)
      30 원정타자8  2구 뒤 2루주자 견제사로 3아웃: 결과 옵션 없는 미완료 타석
    3회말(홈 LT 공격)
      -- 홈타자6   소개 뒤 수비 교체(좌익수 원정타자7 → 원정수비7 a7d, 17 → 7번)와 대타 교체(홈타자6 → 홈대타6 h6b, 16 → 6번)만 있는 빈 타석
      31 홈대타6   2구 뒤 투수 교체(원정투수1 → 원정투수2, 10), 좌익수 앞 1루타
      32 홈타자7   유격수 병살
      33 홈타자8   삼진 아웃
    타석 번호는 빈 타석을 건너뛴 값이다. 새 투구에는 픽스처 PTS 한 개를 복사해 붙이고, 경기 종료 relay는 맨 뒤로 옮긴다.
    """
    game = load_fixture_game()
    meta = game["game"]
    meta["gameId"], meta["gameDate"], meta["gameDateTime"] = game_id, date, f"{date}T18:00:00"
    relays = game["textRelays"]
    end = next(r for r in relays if {t["type"] for t in r["textOptions"]} == {99})
    template = next(r["ptsOptions"][0] for r in relays if r.get("ptsOptions"))
    seq = max(t["seqno"] for r in relays if r is not end for t in r["textOptions"])
    no = max(r["no"] for r in relays if r is not end)
    prefix = date[2:].replace("-", "")
    for title, half, metric, options in _third_inning():
        no += 1
        numbered, pts = [], []
        for option in options:
            seq += 1
            option = {"seqno": seq, **option}
            if option["type"] == 1:
                option["ptsPitchId"] = f"{prefix}_{seq:06d}"
                pts.append({**template, "pitchId": option["ptsPitchId"], "inn": 3})
            numbered.append(option)
        relays.append({
            "title": title, "titleStyle": "0" if numbered[0]["type"] == 0 else "8", "no": no, "inn": 3,
            "homeOrAway": str(half), "statusCode": 0, "metricOption": dict(metric),
            "textOptions": numbered, "ptsOptions": pts,
        })
    for t in sorted(end["textOptions"], key=lambda t: t["seqno"]):
        seq += 1
        t["seqno"] = seq
    end["no"] = no + 1
    return game
