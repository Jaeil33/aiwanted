"""대조 기준값 생성기(tmi_pipeline.parity). 합성 픽스처만 쓴다."""

import json

from fixture_games import load_fixture_game, make_raw_dir, shifted_game
from tmi_pipeline import parity, relay

REF_KEYS = {
    "index", "inning", "half", "batter", "pitcher", "batOrder",
    "outs", "bases", "away", "home", "event", "runs", "complete", "rows",
}


def test_game_reference_keeps_every_plate_appearance():
    game = load_fixture_game()
    ref = parity.game_reference(game)
    assert len(ref) == len(relay.plate_appearances(game))
    assert [r["index"] for r in ref] == list(range(len(ref)))


def test_game_reference_rows_match_the_pitch_row_contract():
    ref = parity.game_reference(load_fixture_game())
    for pa in ref:
        assert set(pa) == REF_KEYS
        for row in pa["rows"]:
            assert len(row) == 16


def test_game_reference_rows_skip_pitches_without_tracking():
    game = load_fixture_game()
    pas = relay.plate_appearances(game)
    tracked = sum(
        1
        for pa in pas
        for _t, pts, _b, _s in relay.walk_pitches(pa.options, pa.pts_by_id)
        if pts is not None
    )
    assert sum(len(pa["rows"]) for pa in parity.game_reference(game)) == tracked


def test_build_writes_every_game_by_id(tmp_path):
    base = load_fixture_game()
    games = [shifted_game(base, '20260801HTLT02026', '2026-08-01'), shifted_game(base, '20260802HTLT02026', '2026-08-02')]
    raw_dir = make_raw_dir(tmp_path, games)
    data = parity.build(raw_dir)
    assert data["games"]
    for game_id, pas in data["games"].items():
        assert len(game_id) == 17
        assert isinstance(pas, list)


def test_main_refuses_a_raw_dir_without_relays(tmp_path, capsys):
    assert parity.main([str(tmp_path / "out.json"), "--raw", str(tmp_path)]) == 2
    assert not (tmp_path / "out.json").exists()


def test_main_writes_json(tmp_path):
    raw_dir = make_raw_dir(tmp_path, [load_fixture_game()])
    out = tmp_path / "ref.json"
    assert parity.main([str(out), "--raw", str(raw_dir), "--limit", "1"]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert len(data["games"]) == 1
