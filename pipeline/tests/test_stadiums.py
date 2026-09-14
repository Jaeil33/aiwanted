import pytest

from tmi_pipeline import stadiums


def test_stadium_coordinates():
    assert stadiums.STADIUMS == {
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


def test_only_gocheok_is_a_dome():
    assert stadiums.DOMES == {"고척"}


def test_haversine_jamsil_to_sajik_is_about_320_km():
    assert stadiums.haversine_km(stadiums.coords("잠실"), stadiums.coords("사직")) == pytest.approx(320, abs=15)


def test_haversine_is_symmetric_and_zero_for_same_point():
    a, b = stadiums.coords("광주"), stadiums.coords("문학")
    assert stadiums.haversine_km(a, b) == pytest.approx(stadiums.haversine_km(b, a))
    assert stadiums.haversine_km(a, a) == 0.0
    assert stadiums.haversine_km(stadiums.coords("대전"), stadiums.coords("한밭")) == 0.0


def test_coords_of_unknown_stadium_raises_key_error():
    with pytest.raises(KeyError):
        stadiums.coords("목동")
