import csv
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


FIELDS = [
    "ident",
    "type",
    "name",
    "latitude_deg",
    "longitude_deg",
    "elevation_ft",
    "continent",
    "iso_country",
    "iso_region",
    "municipality",
    "scheduled_service",
    "gps_code",
    "icao_code",
    "iata_code",
    "local_code",
    "keywords",
]


def write_airports(path: Path) -> None:
    rows = [
        {
            "ident": "KTEB",
            "type": "medium_airport",
            "name": "Teterboro Airport",
            "latitude_deg": "40.850101",
            "longitude_deg": "-74.060799",
            "elevation_ft": "9",
            "continent": "NA",
            "iso_country": "US",
            "iso_region": "US-NJ",
            "municipality": "Teterboro",
            "scheduled_service": "yes",
            "gps_code": "KTEB",
            "icao_code": "KTEB",
            "iata_code": "TEB",
            "local_code": "TEB",
            "keywords": "New York executive",
        },
        {
            "ident": "KPBI",
            "type": "large_airport",
            "name": "Palm Beach International Airport",
            "latitude_deg": "26.683201",
            "longitude_deg": "-80.095596",
            "elevation_ft": "19",
            "continent": "NA",
            "iso_country": "US",
            "iso_region": "US-FL",
            "municipality": "West Palm Beach",
            "scheduled_service": "yes",
            "gps_code": "KPBI",
            "icao_code": "KPBI",
            "iata_code": "PBI",
            "local_code": "PBI",
            "keywords": "Florida",
        },
    ]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def test_airport_search_lookup_and_distance(tmp_path: Path) -> None:
    write_airports(tmp_path / "airports.csv")
    client = TestClient(create_app(tmp_path))

    search = client.get("/api/v1/airports", params={"query": "palm beach"})
    assert search.status_code == 200
    assert [airport["ident"] for airport in search.json()] == ["KPBI"]

    lookup = client.get("/api/v1/airports/teb")
    assert lookup.status_code == 200
    assert lookup.json()["name"] == "Teterboro Airport"
    assert "keywords" not in lookup.json()

    distance = client.get(
        "/api/v1/airports/distance",
        params={"origin": "KTEB", "destination": "PBI"},
    )
    assert distance.status_code == 200
    assert distance.json()["origin"]["ident"] == "KTEB"
    assert 900 < distance.json()["distance_nm"] < 905

    assert client.get("/api/v1/airports/XXXX").status_code == 404
    assert client.get(
        "/api/v1/airports/distance",
        params={"origin": "KTEB", "destination": "TEB"},
    ).status_code == 422


def test_missing_airport_data_is_actionable_and_does_not_break_api(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    assert client.get("/health").status_code == 200
    response = client.get("/api/v1/airports", params={"query": "KTEB"})
    assert response.status_code == 503
    assert "python scripts/download_airports.py" in response.json()["detail"]
    assert "airports.csv" in response.json()["detail"]


def test_flight_estimates_are_calculated_and_stored(tmp_path: Path) -> None:
    write_airports(tmp_path / "airports.csv")
    client = TestClient(create_app(tmp_path))
    pilot = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Estimate",
            "last_name": "Pilot",
            "email": "estimate@example.com",
            "license_number": "ATP-ESTIMATE",
        },
    ).json()
    aircraft = client.post(
        "/api/v1/aircraft",
        json={
            "tail_number": "N500ES",
            "make": "Demo",
            "model": "Jet",
            "passenger_capacity": 8,
            "home_airport": "KTEB",
            "cruise_speed_kts": 450,
            "fuel_burn_gph": 200,
        },
    ).json()

    response = client.post(
        "/api/v1/flights",
        json={
            "flight_number": "PG-EST",
            "aircraft_id": aircraft["id"],
            "pilot_ids": [pilot["id"]],
            "origin": "KTEB",
            "destination": "KPBI",
            "scheduled_departure": "2030-08-01T09:00:00-04:00",
            "scheduled_arrival": "2030-08-01T12:00:00-04:00",
            "passengers": 4,
            "distance_nm": 1,
            "estimated_flight_time_minutes": 1,
            "estimated_leg_time_minutes": 1,
            "estimated_fuel_usage_gallons": 1,
        },
    )

    assert response.status_code == 201
    flight = response.json()
    assert 900 < flight["distance_nm"] < 905
    assert flight["estimated_flight_time_minutes"] == 120.23
    assert flight["estimated_leg_time_minutes"] == 150.23
    assert flight["estimated_fuel_usage_gallons"] == 400.77

    stored = client.get(f"/api/v1/flights/{flight['id']}").json()
    assert stored["distance_nm"] == flight["distance_nm"]
    assert stored["estimated_fuel_usage_gallons"] == flight["estimated_fuel_usage_gallons"]


def test_flight_scheduling_survives_missing_estimate_inputs(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    pilot = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Fallback",
            "last_name": "Pilot",
            "email": "fallback@example.com",
            "license_number": "ATP-FALLBACK",
        },
    ).json()
    aircraft = client.post(
        "/api/v1/aircraft",
        json={
            "tail_number": "N501ES",
            "make": "Demo",
            "model": "Jet",
            "passenger_capacity": 8,
            "home_airport": "KTEB",
        },
    ).json()
    response = client.post(
        "/api/v1/flights",
        json={
            "flight_number": "PG-NO-EST",
            "aircraft_id": aircraft["id"],
            "pilot_ids": [pilot["id"]],
            "origin": "KTEB",
            "destination": "KPBI",
            "scheduled_departure": "2030-08-02T09:00:00-04:00",
            "scheduled_arrival": "2030-08-02T12:00:00-04:00",
        },
    )
    assert response.status_code == 201
    assert response.json()["distance_nm"] is None
    assert response.json()["estimated_flight_time_minutes"] is None
    assert response.json()["estimated_fuel_usage_gallons"] is None

    write_airports(tmp_path / "airports.csv")
    restarted = TestClient(create_app(tmp_path))
    backfilled = restarted.get(f"/api/v1/flights/{response.json()['id']}").json()
    assert 900 < backfilled["distance_nm"] < 905
    assert backfilled["estimated_flight_time_minutes"] is None
    assert backfilled["estimated_fuel_usage_gallons"] is None
