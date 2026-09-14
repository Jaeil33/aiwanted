"""시즌 기록 → 리그 대비 상대 능력치(rel). reference/tmi-prototype/build_data.py에서 이식.

사건 순서는 `contract.EVENT_ORDER` [K, BB+HBP, HR, 3B, 2B, 1B, OUT]이다.
"""

from dataclasses import dataclass

# 리그 평균 쪽으로 당기는 사전 표본 크기(타석)
K_H = 200.0
K_P = 250.0


def _num(value) -> float:
    return float(value or 0)


def innings(s) -> float:
    """네이버 이닝 표기("180 2/3", "45 ⅓", "⅔")를 소수 이닝으로 바꾼다."""
    total = 0.0
    for part in str(s or "0").replace("⅓", " 1/3").replace("⅔", " 2/3").split():
        whole, _, denominator = part.partition("/")
        total += float(whole) / float(denominator) if denominator else float(whole)
    return total


def rel(counts: list[float], prior: float, lg: list[float]) -> list[float]:
    """리그 비율 `lg`로 prior만큼 당긴 비율을 합 1로 맞춘 뒤 리그 대비 배수(소수 넷째 자리).

    표본이 0이면 모든 값이 1이다. 리그 비율이 0인 사건은 비교할 수 없으므로 1로 둔다.
    """
    n = sum(counts)
    rates = [(c + prior * league) / (n + prior) for c, league in zip(counts, lg)]
    total = sum(rates)
    return [round(r / total / league, 4) if league > 0 else 1.0 for r, league in zip(rates, lg)]


@dataclass
class SeasonRates:
    """선수 id → {name, team, counts(길이 7), rel, line}. 투수는 ip·g도 가진다."""

    hitters: dict
    pitchers: dict
    league_hitting: list[float]
    league_pitching: list[float]


def season_rates(hitters: list[dict], pitchers: list[dict]) -> SeasonRates:
    """네이버 seasonPlayerStats 목록(타자·투수)으로 선수별 사건 수와 rel을 만든다."""
    hit: dict[str, dict] = {}
    for p in hitters:
        ab, h, d2, d3, hr = (_num(p.get(k)) for k in ("hitterAb", "hitterHit", "hitterH2", "hitterH3", "hitterHr"))
        bb, hp, k = _num(p.get("hitterBb")), _num(p.get("hitterHp")), _num(p.get("hitterKk"))
        if ab + bb + hp <= 0:
            continue
        hit[p["playerId"]] = {
            "name": p["playerName"],
            "team": p["teamId"],
            "counts": [k, bb + hp, hr, d3, d2, h - d2 - d3 - hr, ab - h - k],
            "line": {
                "pa": int(ab + bb + hp),
                "avg": round(h / ab, 3) if ab else 0,
                "obp": _num(p.get("hitterObp")),
                "slg": _num(p.get("hitterSlg")),
                "hr": int(hr),
                "k": int(k),
                "bb": int(bb),
            },
        }
    totals = [sum(x["counts"][i] for x in hit.values()) for i in range(7)]
    league_hitting = [t / sum(totals) for t in totals]
    non_hr_hits = totals[3] + totals[4] + totals[5]

    pit: dict[str, dict] = {}
    for p in pitchers:
        ip = innings(p.get("pitcherInning"))
        if ip <= 0:
            continue
        h, hr, bb, hp, k = (_num(p.get(x)) for x in ("pitcherHit", "pitcherHr", "pitcherBb", "pitcherHp", "pitcherKk"))
        nh = h - hr  # 홈런이 아닌 안타는 리그 타자의 3B·2B·1B 비율로 나눈다
        pit[p["playerId"]] = {
            "name": p["playerName"],
            "team": p["teamId"],
            "ip": ip,
            "g": _num(p.get("pitcherGameCount")),
            "counts": [
                k,
                bb + hp,
                hr,
                nh * totals[3] / non_hr_hits,
                nh * totals[4] / non_hr_hits,
                nh * totals[5] / non_hr_hits,
                max(3 * ip - k, 0.0),
            ],
            "line": {
                "era": _num(p.get("pitcherEra")),
                "ip": p.get("pitcherInning"),
                "k": int(k),
                "bb": int(bb),
                "whip": _num(p.get("pitcherWhip")),
                "sv": int(_num(p.get("pitcherSave"))),
                "hold": int(_num(p.get("pitcherHold"))),
                "g": int(_num(p.get("pitcherGameCount"))),
            },
        }
    totals_p = [sum(x["counts"][i] for x in pit.values()) for i in range(7)]
    league_pitching = [t / sum(totals_p) for t in totals_p]

    for x in hit.values():
        x["rel"] = rel(x["counts"], K_H, league_hitting)
    for x in pit.values():
        x["rel"] = rel(x["counts"], K_P, league_pitching)
    return SeasonRates(hit, pit, league_hitting, league_pitching)


def bullpen(rates: SeasonRates, team: str) -> dict:
    """팀 구원투수(8경기 이상, 경기당 2이닝 미만)를 합친 합성 투수. 없으면 리그 평균(rel 전부 1)."""
    pen = [x for x in rates.pitchers.values() if x["team"] == team and x["g"] >= 8 and x["ip"] / x["g"] < 2.0]
    counts = [sum(x["counts"][i] for x in pen) for i in range(7)]
    return {"id": f"{team}-pen", "team": team, "name": "불펜", "rel": rel(counts, K_P, rates.league_pitching), "n": len(pen)}
