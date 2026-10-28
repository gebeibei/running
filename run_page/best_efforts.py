"""Per-activity best efforts (fastest segment over a target distance).

A single run can contain a faster 5K than any standalone 5K run (tempo
intervals, race-pace blocks inside a long run), so the personal best for a
distance has to be searched *inside* every track, not across whole activities.
Strava/Keep both publish these numbers as "best efforts"; this module rebuilds
them locally from the GPX tracks in ``GPX_OUT``.

The series built here is intentionally conservative:

* auto-pause gaps (``dt > PAUSE_GAP_SECONDS``) contribute neither time nor
  distance, so a stop does not inflate a segment;
* single steps faster than ``MAX_STEP_SPEED`` are GPS jumps and are clipped;
* the raw chord sum of GPS points under-counts real distance by roughly 1%,
  so every series is rescaled by ``recorded_distance / chord_sum``. Only
  plausible scales are accepted; a broken track is skipped instead of being
  stretched;
* the GPX time axis is rebuilt by ``keep_sync`` from Keep's decisecond point
  stamps (``stamp // 10``), which silently compresses long tracks whose point
  spacing is not exactly one second, so times are rescaled by
  ``recorded_duration / track_span`` too.

Both axes then match the recorded totals, i.e. a segment is measured with the
same counter the watch used. Validated against Keep's published personal bests
(5K 19:13, 10K 40:47, half 1:30:46, marathon 3:16:41): this module reports
19:18 / 40:47 / 1:30:26 / 3:16:39, i.e. at most 20 s (0.4%) apart.
"""

import datetime
import math
import os
import re

# Targets kept in the activities JSON. Values are seconds (ints).
TARGETS = (
    ("1k", 1000.0),
    ("5k", 5000.0),
    ("10k", 10000.0),
    ("half", 21097.5),
    ("marathon", 42195.0),
)

PAUSE_GAP_SECONDS = 5.0
MAX_STEP_SPEED = 6.5  # m/s, ~21.8 km/h: faster than any human step
MIN_POINTS = 30
MIN_SERIES_DISTANCE = 1000.0
DISTANCE_SCALE_MIN = 0.90
DISTANCE_SCALE_MAX = 1.15
MAX_SPAN_DEVIATION = 0.05
# A segment faster than 2:45/km is noise (GPS jump, ride mislabelled as a run).
MIN_SEGMENT_PACE = 165.0

_TRKPT_RE = re.compile(r"<trkpt\b([^>]*)>(.*?)</trkpt>", re.DOTALL)
_LAT_RE = re.compile(r'lat="([^"]+)"')
_LON_RE = re.compile(r'lon="([^"]+)"')
_TIME_RE = re.compile(r"<time>([^<]+)</time>")

_EARTH_RADIUS = 6371000.0


def haversine(lat1, lon1, lat2, lon2):
    """Great-circle distance in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * _EARTH_RADIUS * math.asin(math.sqrt(a))


def _parse_time(value):
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.datetime.fromisoformat(text).timestamp()


def read_track_points(gpx_path):
    """Return ``[(timestamp, lat, lon), ...]`` for a GPX file."""
    with open(gpx_path, encoding="utf-8", errors="ignore") as handle:
        content = handle.read()

    points = []
    for match in _TRKPT_RE.finditer(content):
        attrs, body = match.group(1), match.group(2)
        lat = _LAT_RE.search(attrs)
        lon = _LON_RE.search(attrs)
        when = _TIME_RE.search(body)
        if not (lat and lon and when):
            continue
        try:
            points.append(
                (_parse_time(when.group(1)), float(lat.group(1)), float(lon.group(1)))
            )
        except ValueError:
            continue
    return points


def build_series(points):
    """Build the (time, distance) series used for segment lookups.

    Returns ``(times, dists)`` where both are cumulative and monotonic.
    """
    times = [0.0]
    dists = [0.0]
    for index in range(1, len(points)):
        prev = points[index - 1]
        current = points[index]
        dt = current[0] - prev[0]
        if dt <= 0:
            continue
        step = haversine(prev[1], prev[2], current[1], current[2])
        if dt > PAUSE_GAP_SECONDS:
            # Paused: nothing counts until the watch resumes.
            dt = 0.0
            step = 0.0
        else:
            step = min(step, MAX_STEP_SPEED * dt)
        times.append(times[-1] + dt)
        dists.append(dists[-1] + step)
    return times, dists


def best_segment(times, dists, target):
    """Fastest window covering ``target`` meters; returns seconds or None."""
    if not dists or dists[-1] < target:
        return None
    best = None
    left = 0
    for right in range(len(dists)):
        if dists[right] < target:
            continue
        while dists[right] - dists[left] >= target:
            left += 1
        start = max(left - 1, 0)
        elapsed = times[right] - times[start]
        if best is None or elapsed < best:
            best = elapsed
    return best


def _moving_seconds(value, fallback_distance=None):
    """Normalise ``moving_time`` (timedelta or string) to seconds."""
    if isinstance(value, datetime.timedelta):
        return value.total_seconds()
    if isinstance(value, (int, float)):
        return float(value)
    if not value:
        return 0.0
    text = str(value).strip()
    if "day" in text:
        text = text.split(",")[-1].strip()
    if " " in text:
        text = text.split(" ")[-1]
    if "." in text:
        text = text.split(".")[0]
    parts = text.split(":")
    try:
        nums = [int(part) for part in parts]
    except ValueError:
        return 0.0
    if len(nums) == 3:
        return float(nums[0] * 3600 + nums[1] * 60 + nums[2])
    if len(nums) == 2:
        return float(nums[0] * 60 + nums[1])
    if len(nums) == 1:
        return float(nums[0])
    return 0.0


def compute_best_efforts(gpx_path, distance, moving_time, activity_type="Run"):
    """Best efforts for one activity, or ``None`` when the track is unusable.

    ``distance`` is the recorded distance (meters), ``moving_time`` the
    recorded duration (timedelta or string).
    """
    if activity_type != "Run":
        return None
    if not gpx_path or not os.path.exists(gpx_path):
        return None

    moving = _moving_seconds(moving_time)
    if moving <= 0 or not distance:
        return None

    points = read_track_points(gpx_path)
    if len(points) < MIN_POINTS:
        return None

    times, dists = build_series(points)
    if dists[-1] < MIN_SERIES_DISTANCE:
        return None

    # The GPX time axis must agree with the recorded duration, otherwise the
    # timestamps themselves are broken and no segment time can be trusted.
    span = times[-1]
    if span <= 0 or abs(span - moving) / moving > MAX_SPAN_DEVIATION:
        return None

    scale = float(distance) / dists[-1]
    if not DISTANCE_SCALE_MIN <= scale <= DISTANCE_SCALE_MAX:
        return None
    if abs(scale - 1.0) > 1e-9:
        dists = [value * scale for value in dists]

    # Long tracks lose time to the decisecond -> whole-second truncation in
    # keep_sync, so the rebuilt axis is up to a few percent short. Express
    # segments on the recorded clock (the one the PB was achieved on).
    time_scale = moving / span
    if abs(time_scale - 1.0) > 1e-9:
        times = [value * time_scale for value in times]

    efforts = {}
    for key, target in TARGETS:
        seconds = best_segment(times, dists, target)
        if seconds is None or seconds <= 0:
            continue
        if seconds / target * 1000.0 < MIN_SEGMENT_PACE:
            continue
        efforts[key] = round(seconds)
    return efforts or None


def best_efforts_for_activity(activity, gpx_folder):
    """Wrapper around :func:`compute_best_efforts` for a DB ``Activity`` row."""
    if activity is None or not gpx_folder:
        return None
    run_id = getattr(activity, "run_id", None)
    if run_id is None:
        return None
    return compute_best_efforts(
        os.path.join(gpx_folder, f"{run_id}.gpx"),
        getattr(activity, "distance", 0),
        getattr(activity, "moving_time", None),
        getattr(activity, "type", None) or "Run",
    )
