from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest

from tmi_pipeline import weather


def hourly_payload(start: str, hours: int, temp=None, wind=None, precip=None) -> dict:
    """Open-Meteo archive 응답 모양의 합성 시계열. 값 목록을 주지 않으면 시각에 따라 만든다."""
    t0 = datetime.fromisoformat(start)
    times = [(t0 + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)]
    return {
        "latitude": 37.5, "longitude": 127.0, "timezone": "Asia/Seoul",
        "hourly_units": {"time": "iso8601", "temperature_2m": "°C", "wind_speed_10m": "m/s", "precipitation": "mm"},
        "hourly": {
            "time": times,
            "temperature_2m": temp if temp is not None else [20.0 + i % 24 * 0.5 for i in range(hours)],
            "wind_speed_10m": wind if wind is not None else [1.0 + i % 5 for i in range(hours)],
            "precipitation": precip if precip is not None else [0.0] * hours,
        },
    }


class FakeFetch:
    def __init__(self, payload=None, failures=0):
        self.payload = payload or hourly_payload("2026-08-15T00:00", 24)
        self.failures = failures
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        if len(self.urls) <= self.failures:
            raise OSError("network down")
        return self.payload


def no_sleep(_seconds):
    return None


def test_archive_url_and_query():
    url = weather.archive_url(37.5122, 127.0719, "2021-03-01", "2026-09-13")
    parsed = urlparse(url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == weather.ARCHIVE_URL == "https://archive-api.open-meteo.com/v1/archive"
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    assert query == {
        "latitude": "37.5122",
        "longitude": "127.0719",
        "start_date": "2021-03-01",
        "end_date": "2026-09-13",
        "hourly": "temperature_2m,wind_speed_10m,precipitation",
        "wind_speed_unit": "ms",
        "timezone": "Asia/Seoul",
    }


def test_fetch_site_weather_writes_cache_and_reuses_it(tmp_path):
    fetch = FakeFetch()
    first = weather.fetch_site_weather("잠실", 37.5122, 127.0719, "2026-08-15", "2026-08-15", tmp_path, fetch=fetch, sleep=no_sleep)
    assert first == fetch.payload
    assert (tmp_path / "om_archive_37.5122_127.0719_2026-08-15_2026-08-15.json").is_file()
    second = weather.fetch_site_weather("잠실", 37.5122, 127.0719, "2026-08-15", "2026-08-15", tmp_path, fetch=fetch, sleep=no_sleep)
    assert second == first
    assert len(fetch.urls) == 1


def test_fetch_site_weather_retries_three_times(tmp_path):
    flaky = FakeFetch(failures=3)
    payload = weather.fetch_site_weather("사직", 35.194, 129.0615, "2026-08-15", "2026-08-15", tmp_path, fetch=flaky, sleep=no_sleep)
    assert payload == flaky.payload
    assert len(flaky.urls) == 4

    broken = FakeFetch(failures=99)
    with pytest.raises(RuntimeError, match="사직"):
        weather.fetch_site_weather("사직", 35.194, 129.0615, "2026-08-16", "2026-08-16", tmp_path, fetch=broken, sleep=no_sleep)
    assert len(broken.urls) == 4
    assert not (tmp_path / "om_archive_35.194_129.0615_2026-08-16_2026-08-16.json").exists()


def test_real_requests_are_spaced_by_the_interval(tmp_path):
    waits = []
    fetch = FakeFetch()
    for day in ("01", "02", "03"):
        weather.fetch_site_weather("잠실", 37.5, 127.0, f"2026-08-{day}", f"2026-08-{day}", tmp_path, fetch=fetch, sleep=waits.append)
    assert len(fetch.urls) == 3
    # 첫 요청 뒤로는 1초 간격을 맞추려고 기다린다
    assert len(waits) >= 2
    assert all(0 < w <= weather.REQUEST_INTERVAL_S for w in waits)


def test_load_stadium_series_fetches_shared_coordinates_once(tmp_path):
    fetch = FakeFetch()
    series = weather.load_stadium_series(["대전", "한밭", "잠실"], "2026-08-15", "2026-08-15", tmp_path, fetch=fetch, sleep=no_sleep)
    assert set(series) == {"대전", "한밭", "잠실"}
    assert len(fetch.urls) == 2
    assert series["대전"] is series["한밭"]
    assert isinstance(series["잠실"], weather.HourlySeries)


def test_hourly_series_at_uses_the_top_of_the_hour():
    payload = hourly_payload("2026-08-15T00:00", 24, temp=[float(i) for i in range(24)], wind=[i / 10 for i in range(24)],
                             precip=[0.0] * 17 + [0.4] + [0.0] * 6)
    series = weather.HourlySeries(payload)
    assert series.at(datetime(2026, 8, 15, 18, 30)) == (18.0, 1.8, 0.0)
    assert series.at(datetime(2026, 8, 15, 17, 0)) == (17.0, 1.7, 0.4)
    assert series.at(datetime(2026, 8, 16, 0, 0)) is None
    assert series.at(datetime(2026, 8, 14, 23, 0)) is None


def test_hourly_series_at_keeps_missing_values_as_none():
    payload = hourly_payload("2026-08-15T00:00", 3, temp=[None, 25.0, 25.5], wind=[1.0, None, 2.0], precip=[0.0, 0.0, None])
    series = weather.HourlySeries(payload)
    assert series.at(datetime(2026, 8, 15, 0)) == (None, 1.0, 0.0)
    assert series.at(datetime(2026, 8, 15, 1)) == (25.0, None, 0.0)
    assert series.at(datetime(2026, 8, 15, 2)) == (25.5, 2.0, None)


def test_precip_sum_adds_hours_ending_inside_the_window():
    # 시각 t의 강수는 (t-1h, t] 합이다: 15:00~18:00 창에는 16·17·18시 값이 들어간다
    precip = [0.0] * 24
    precip[15], precip[16], precip[17], precip[18] = 9.0, 0.5, 1.25, 0.25
    series = weather.HourlySeries(hourly_payload("2026-08-15T00:00", 24, precip=precip))
    assert series.precip_sum(datetime(2026, 8, 15, 15), datetime(2026, 8, 15, 18)) == pytest.approx(2.0)
    assert series.precip_sum(datetime(2026, 8, 15, 14), datetime(2026, 8, 15, 15)) == pytest.approx(9.0)


def test_precip_sum_is_none_without_any_value():
    precip = [None] * 24
    precip[17] = 0.3
    series = weather.HourlySeries(hourly_payload("2026-08-15T00:00", 24, precip=precip))
    assert series.precip_sum(datetime(2026, 8, 15, 15), datetime(2026, 8, 15, 18)) == pytest.approx(0.3)
    assert series.precip_sum(datetime(2026, 8, 15, 18), datetime(2026, 8, 15, 21)) is None
    assert series.precip_sum(datetime(2026, 9, 1, 15), datetime(2026, 9, 1, 18)) is None
