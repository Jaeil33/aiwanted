"""Open-Meteo 기록(archive) API의 구장별 시간별 날씨와 캐시.

외부 네트워크는 이 모듈의 `http_get_json`만 쓴다. 캐시 파일이 있으면 요청하지 않는다.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable

from .io import load_json, write_json
from .stadiums import coords

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HOURLY_VARIABLES = ("temperature_2m", "wind_speed_10m", "precipitation")

# 실제 요청 사이 최소 간격과 실패 시 재시도(대기 시간은 분당 호출 한도가 풀리도록 점점 길게)
REQUEST_INTERVAL_S = 1.0
RETRIES = 3
RETRY_WAITS_S = (5.0, 30.0, 65.0)
TIMEOUT_S = 120

_last_request_at: float | None = None


def http_get_json(url: str) -> dict:
    """GET → JSON. HTTP 오류는 응답 본문 일부를 담은 OSError로 바꾼다."""
    request = urllib.request.Request(url, headers={"User-Agent": "tmi-baseball-pipeline"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise OSError(f"HTTP {error.code}: {error.read()[:300]!r}") from error


def archive_url(lat: float, lon: float, start: str, end: str) -> str:
    """시간별 기온·10m 풍속(m/s)·강수, 한국 시각."""
    query = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "hourly": ",".join(HOURLY_VARIABLES),
        "wind_speed_unit": "ms",
        "timezone": "Asia/Seoul",
    })
    return f"{ARCHIVE_URL}?{query}"


def cache_path(cache_dir: Path, lat: float, lon: float, start: str, end: str) -> Path:
    return Path(cache_dir) / f"om_archive_{lat}_{lon}_{start}_{end}.json"


def _throttle(sleep: Callable[[float], None]) -> None:
    global _last_request_at
    if _last_request_at is not None:
        wait = REQUEST_INTERVAL_S - (time.monotonic() - _last_request_at)
        if wait > 0:
            sleep(wait)
    _last_request_at = time.monotonic()


def fetch_site_weather(
    site: str,
    lat: float,
    lon: float,
    start: str,
    end: str,
    cache_dir: Path,
    fetch: Callable[[str], dict] = http_get_json,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """한 좌표의 archive 응답. 캐시가 있으면 그대로 읽고, 없으면 받아서 캐시에 쓴다(실패 시 3번 재시도)."""
    path = cache_path(cache_dir, lat, lon, start, end)
    if path.is_file():
        return load_json(path)
    url = archive_url(lat, lon, start, end)
    error: Exception | None = None
    for attempt in range(RETRIES + 1):
        if attempt:
            sleep(RETRY_WAITS_S[min(attempt, len(RETRY_WAITS_S)) - 1])
        _throttle(sleep)
        try:
            payload = fetch(url)
        except Exception as exc:  # 네트워크·HTTP 오류는 재시도한다
            error = exc
            continue
        if not isinstance(payload, dict) or "hourly" not in payload:
            error = ValueError(f"hourly가 없는 응답: {str(payload)[:200]}")
            continue
        write_json(path, payload)
        return payload
    raise RuntimeError(f"Open-Meteo 기록 API 요청 실패: {site} ({lat}, {lon}) {start}~{end}: {error}") from error


class HourlySeries:
    """archive 응답의 시간별 값. 시각 키는 한국 시각 정시("YYYY-MM-DDTHH:00")."""

    def __init__(self, payload: dict):
        hourly = payload.get("hourly") or {}
        times = hourly.get("time") or []
        self._index = {stamp[:13]: i for i, stamp in enumerate(times)}
        n = len(times)
        self._temp = hourly.get("temperature_2m") or [None] * n
        self._wind = hourly.get("wind_speed_10m") or [None] * n
        self._precip = hourly.get("precipitation") or [None] * n

    def _position(self, dt: datetime) -> int | None:
        return self._index.get(dt.strftime("%Y-%m-%dT%H"))

    def at(self, dt: datetime) -> tuple[float | None, float | None, float | None] | None:
        """dt가 속한 정시의 (기온, 풍속, 강수). 그 시각이 시계열에 없으면 None."""
        i = self._position(dt)
        if i is None:
            return None
        return self._temp[i], self._wind[i], self._precip[i]

    def precip_sum(self, start: datetime, end: datetime) -> float | None:
        """(start, end] 구간에 끝나는 정시 강수의 합(시각 t의 값은 직전 1시간 합). 값이 하나도 없으면 None."""
        hour = start.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        stop = end.replace(minute=0, second=0, microsecond=0)
        values: list[float] = []
        while hour <= stop:
            i = self._position(hour)
            if i is not None and self._precip[i] is not None:
                values.append(self._precip[i])
            hour += timedelta(hours=1)
        return sum(values) if values else None


def load_stadium_series(
    stadiums: list[str],
    start: str,
    end: str,
    cache_dir: Path,
    fetch: Callable[[str], dict] = http_get_json,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, HourlySeries]:
    """구장 이름 → 시계열. 좌표가 같은 구장(대전·한밭)은 한 번만 받아 같은 시계열을 나눠 쓴다."""
    by_coords: dict[tuple[float, float], HourlySeries] = {}
    series: dict[str, HourlySeries] = {}
    for name in stadiums:
        lat, lon = coords(name)
        if (lat, lon) not in by_coords:
            by_coords[(lat, lon)] = HourlySeries(fetch_site_weather(name, lat, lon, start, end, cache_dir, fetch, sleep=sleep))
        series[name] = by_coords[(lat, lon)]
    return series
