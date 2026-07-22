from __future__ import annotations

import csv
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen


URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
DESTINATION = Path(__file__).resolve().parent.parent / "data" / "airports.csv"
REQUIRED_COLUMNS = {"ident", "name", "latitude_deg", "longitude_deg", "icao_code", "iata_code"}


def main() -> None:
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with urlopen(URL, timeout=120) as response, NamedTemporaryFile(
            "wb", dir=DESTINATION.parent, prefix=".airports.", suffix=".tmp", delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            while chunk := response.read(1024 * 1024):
                temporary.write(chunk)
            temporary.flush()
            os.fsync(temporary.fileno())
        with temporary_path.open(encoding="utf-8", newline="") as file:
            headers = set(csv.DictReader(file).fieldnames or [])
        missing = REQUIRED_COLUMNS - headers
        if missing:
            raise RuntimeError(f"download is missing required columns: {', '.join(sorted(missing))}")
        temporary_path.replace(DESTINATION)
        print(f"Downloaded OurAirports data to {DESTINATION}")
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


if __name__ == "__main__":
    main()
