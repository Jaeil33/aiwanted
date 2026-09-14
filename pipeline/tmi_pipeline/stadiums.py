"""KBO 구장 좌표와 거리. 일정 원자료의 `stadium` 이름을 키로 쓴다."""

import math

# 구장 이름 → (위도, 경도)
STADIUMS: dict[str, tuple[float, float]] = {
    "잠실": (37.5122, 127.0719),
    "고척": (37.4982, 126.8671),
    "문학": (37.4370, 126.6932),
    "광주": (35.1682, 126.8891),
    "수원": (37.2997, 127.0097),
    "창원": (35.2225, 128.5822),
    "사직": (35.1940, 129.0615),
    "대구": (35.8411, 128.6817),
    "대전": (36.3165, 127.4290),
    "한밭": (36.3165, 127.4290),
    "울산": (35.5323, 129.2656),
    "포항": (36.0080, 129.3590),
    "청주": (36.6390, 127.4700),
}

# 날씨 변수를 0(중립)으로 두는 돔 구장(ADR-004)
DOMES = {"고척"}

EARTH_RADIUS_KM = 6371.0


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """두 (위도, 경도) 사이 대원 거리(km)."""
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def coords(stadium: str) -> tuple[float, float]:
    """구장 좌표. 모르는 구장 이름이면 KeyError."""
    return STADIUMS[stadium]
