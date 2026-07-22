from __future__ import annotations

import csv
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from threading import Lock

from fastapi import HTTPException

from .models import Airport, AirportDistance


DOWNLOAD_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
REQUIRED_COLUMNS = {
    "ident",
    "type",
    "name",
    "latitude_deg",
    "longitude_deg",
    "iso_country",
    "iso_region",
    "municipality",
    "gps_code",
    "icao_code",
    "iata_code",
    "local_code",
    "keywords",
}


class AirportCatalog:
    def __init__(self, path: Path):
        self.path = path
        self._airports: list[Airport] | None = None
        self._aliases: dict[str, list[Airport]] = {}
        self._search_text: dict[str, str] = {}
        self._lock = Lock()

    def _unavailable(self, reason: str) -> HTTPException:
        return HTTPException(
            status_code=503,
            detail=(
                f"Airport dataset {reason} at {self.path}. Download it with "
                f"'python scripts/download_airports.py' from backend, or download {DOWNLOAD_URL} "
                f"and save it as {self.path}."
            ),
        )

    def _load(self) -> list[Airport]:
        if self._airports is not None:
            return self._airports
        with self._lock:
            if self._airports is not None:
                return self._airports
            if not self.path.is_file():
                raise self._unavailable("was not found")
            try:
                with self.path.open(encoding="utf-8", newline="") as file:
                    reader = csv.DictReader(file)
                    missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
                    if missing:
                        raise ValueError(f"is missing required columns: {', '.join(sorted(missing))}")
                    airports = [self._parse(row) for row in reader]
            except (KeyError, OSError, UnicodeError, ValueError) as exc:
                raise self._unavailable(f"could not be loaded ({exc})") from exc
            if not airports:
                raise self._unavailable("is empty")

            aliases: dict[str, list[Airport]] = {}
            search_text: dict[str, str] = {}
            for airport in airports:
                codes = {
                    airport.ident,
                    airport.gps_code,
                    airport.icao_code,
                    airport.iata_code,
                    airport.local_code,
                }
                for code in filter(None, codes):
                    aliases.setdefault(code.casefold(), []).append(airport)
                search_text[airport.ident] = " ".join(
                    filter(
                        None,
                        [
                            airport.ident,
                            airport.gps_code,
                            airport.icao_code,
                            airport.iata_code,
                            airport.local_code,
                            airport.name,
                            airport.municipality,
                            airport.iso_country,
                            airport.iso_region,
                            airport.keywords,
                        ],
                    )
                ).casefold()
            self._aliases = aliases
            self._search_text = search_text
            self._airports = airports
            return airports

    @staticmethod
    def _parse(row: dict[str, str]) -> Airport:
        elevation = row.get("elevation_ft", "").strip()
        return Airport(
            ident=row["ident"],
            type=row["type"],
            name=row["name"],
            latitude_deg=float(row["latitude_deg"]),
            longitude_deg=float(row["longitude_deg"]),
            elevation_ft=int(elevation) if elevation else None,
            municipality=row["municipality"] or None,
            iso_country=row["iso_country"],
            iso_region=row["iso_region"],
            gps_code=row["gps_code"] or None,
            icao_code=row["icao_code"] or None,
            iata_code=row["iata_code"] or None,
            local_code=row["local_code"] or None,
            keywords=row["keywords"] or None,
        )

    def lookup(self, code: str) -> Airport:
        self._load()
        matches = self._aliases.get(code.strip().casefold(), [])
        if not matches:
            raise HTTPException(status_code=404, detail=f"Airport {code.strip().upper()} not found")
        exact_ident = [airport for airport in matches if airport.ident.casefold() == code.strip().casefold()]
        if exact_ident:
            return exact_ident[0]
        unique = {airport.ident: airport for airport in matches}
        if len(unique) > 1:
            raise HTTPException(
                status_code=409,
                detail=f"Airport code {code.strip().upper()} is ambiguous; use a unique airport ident",
            )
        return next(iter(unique.values()))

    def search(self, query: str, limit: int) -> list[Airport]:
        airports = self._load()
        normalized = query.strip().casefold()
        if len(normalized) < 2:
            raise HTTPException(status_code=422, detail="Airport search query must contain at least 2 characters")
        matches = [airport for airport in airports if normalized in self._search_text[airport.ident]]

        def rank(airport: Airport) -> tuple[int, str]:
            codes = filter(None, [airport.ident, airport.icao_code, airport.gps_code, airport.iata_code, airport.local_code])
            normalized_codes = [code.casefold() for code in codes]
            if normalized in normalized_codes:
                return (0, airport.name)
            if any(code.startswith(normalized) for code in normalized_codes):
                return (1, airport.name)
            if airport.name.casefold().startswith(normalized) or (airport.municipality or "").casefold().startswith(normalized):
                return (2, airport.name)
            return (3, airport.name)

        return sorted(matches, key=rank)[:limit]

    def distance(self, origin: str, destination: str) -> AirportDistance:
        origin_airport = self.lookup(origin)
        destination_airport = self.lookup(destination)
        if origin_airport.ident == destination_airport.ident:
            raise HTTPException(status_code=422, detail="origin and destination must differ")
        return AirportDistance(
            origin=origin_airport,
            destination=destination_airport,
            distance_nm=round(
                haversine_nm(
                    origin_airport.latitude_deg,
                    origin_airport.longitude_deg,
                    destination_airport.latitude_deg,
                    destination_airport.longitude_deg,
                ),
                2,
            ),
        )


def haversine_nm(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    latitude_delta = radians(latitude_b - latitude_a)
    longitude_delta = radians(longitude_b - longitude_a)
    a = (
        sin(latitude_delta / 2) ** 2
        + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(longitude_delta / 2) ** 2
    )
    return 2 * 3440.065 * asin(min(1.0, sqrt(a)))
