"""Regenerate ``src/static/activities.json`` from the local SQLite database.

Unlike ``db_updater.py`` this does *not* re-sync ``GPX_OUT`` into the database:
the database stays the source of truth and only the derived fields refreshed by
``Generator.load()`` (streak, best efforts) change. Use it after touching the
export path.

    cd run_page && python regen_activities.py

Best efforts are cached on the activity rows; pass ``--force`` to drop the
cache and recompute them from GPX (needed after changing ``best_efforts.py``).
The GPX folder can be overridden with ``GPX_FOLDER``.
"""

import argparse
import json

from config import JSON_FILE, SQL_FILE
from generator import Generator
from generator.db import Activity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="recompute cached best efforts for every activity",
    )
    args = parser.parse_args()

    generator = Generator(SQL_FILE)
    if args.force:
        cleared = generator.session.query(Activity).update(
            {Activity.best_efforts: None}
        )
        generator.session.commit()
        print(f"cleared cached best efforts on {cleared} activities")

    activities = generator.load()
    with open(JSON_FILE, "w", encoding="utf-8") as handle:
        json.dump(activities, handle)
    print(f"wrote {len(activities)} activities to {JSON_FILE}")


if __name__ == "__main__":
    main()
