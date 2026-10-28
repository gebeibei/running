import datetime
import importlib
from pathlib import Path

import pytest


@pytest.fixture
def best_efforts(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).parent / "run_page"))
    return importlib.import_module("best_efforts")


def _lat_step(mod, meters, lat0=30.0, lon0=120.0):
    """Latitude delta that moves exactly ``meters`` north of ``lat0``."""
    low, high = 0.0, 1.0
    for _ in range(64):
        mid = (low + high) / 2
        if mod.haversine(lat0, lon0, lat0 + mid, lon0) < meters:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def _points(mod, count, meters=10.0, step_seconds=3.0):
    step = _lat_step(mod, meters)
    return [
        (i * step_seconds, 30.0 + i * step, 120.0) for i in range(count)
    ]


def _write_gpx(path, points):
    body = "".join(
        f'<trkpt lat="{lat:.9f}" lon="{lon:.9f}"><time>'
        f"{datetime.datetime.fromtimestamp(ts, datetime.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')}"
        f"</time></trkpt>"
        for ts, lat, lon in points
    )
    path.write_text(
        '<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>'
        f"{body}</trkseg></trk></gpx>",
        encoding="utf-8",
    )
    return path


def test_straight_run_matches_even_pace(best_efforts, tmp_path):
    # 1001 points * 10 m = 10 km, one point every 3 s -> 3000 s for 10 km.
    gpx = _write_gpx(tmp_path / "1.gpx", _points(best_efforts, 1001))

    efforts = best_efforts.compute_best_efforts(gpx, 10000.0, 3000)

    assert efforts == {"1k": 300, "5k": 1500, "10k": 3000}


def test_pause_is_not_counted(best_efforts, tmp_path):
    # Same run with a 60 s stop after 5 km: the stop must not be charged to any
    # effort, and the recorded duration (3000 s) already excludes it.
    points = _points(best_efforts, 1001)
    paused = [
        (ts + 60.0, lat, lon) if index >= 501 else (ts, lat, lon)
        for index, (ts, lat, lon) in enumerate(points)
    ]
    gpx = _write_gpx(tmp_path / "2.gpx", paused)

    efforts = best_efforts.compute_best_efforts(gpx, 10000.0, 3000)

    assert efforts is not None
    # Collapsing the gap also drops the one interval that spans it, so allow a
    # few seconds of slack instead of demanding the exact even-pace numbers.
    assert efforts["5k"] == pytest.approx(1500, abs=6)
    assert efforts["10k"] == pytest.approx(3000, abs=6)


def test_rejects_non_run_and_broken_track(best_efforts, tmp_path):
    gpx = _write_gpx(tmp_path / "3.gpx", _points(best_efforts, 1001))

    assert best_efforts.compute_best_efforts(gpx, 10000.0, 3000, "Ride") is None
    # Recorded duration far off the track timestamps -> untrustworthy axis.
    assert best_efforts.compute_best_efforts(gpx, 10000.0, 4000) is None
    assert best_efforts.compute_best_efforts(tmp_path / "nope.gpx", 10000.0, 3000) is None


def test_rescales_to_recorded_distance_and_duration(best_efforts, tmp_path):
    # Track sums to 10 km / 3000 s but the watch recorded 11 km / 3100 s, the
    # usual +1% chord undercount. A uniform run must then hit 10 km at
    # 3100 * 10000 / 11000 = 2818 s.
    gpx = _write_gpx(tmp_path / "4.gpx", _points(best_efforts, 1001))

    efforts = best_efforts.compute_best_efforts(gpx, 11000.0, 3100)

    assert efforts is not None
    assert efforts["10k"] == pytest.approx(2818, abs=6)
    assert efforts["5k"] == pytest.approx(1409, abs=4)
