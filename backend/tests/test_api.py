import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def build_client(data_dir: Path) -> TestClient:
    return TestClient(create_app(data_dir))


def test_complete_scheduling_workflow_and_persistence(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    assert client.get("/health").json() == {"status": "ok"}
    pilot_response = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Avery",
            "last_name": "Stone",
            "email": "avery@example.com",
            "license_number": "ATP-1001",
            "certifications": ["ATP", "Citation Latitude"],
            "medical_expires": "2031-01-01",
        },
    )
    assert pilot_response.status_code == 201
    pilot = pilot_response.json()

    aircraft_response = client.post(
        "/api/v1/aircraft",
        json={
            "tail_number": "n123pg",
            "make": "Cessna",
            "model": "Citation Latitude",
            "year": 2022,
            "passenger_capacity": 9,
            "home_airport": "kteb",
        },
    )
    assert aircraft_response.status_code == 201
    aircraft = aircraft_response.json()
    assert aircraft["tail_number"] == "N123PG"

    trip_response = client.post(
        "/api/v1/trips",
        json={
            "customer_name": "Northwind Aviation",
            "customer_email": "ops@northwind.example",
            "origin": "kteb",
            "destination": "kpbi",
            "departure_at": "2030-08-01T09:00:00-04:00",
            "return_at": "2030-08-03T16:00:00-04:00",
            "passengers": 5,
            "purpose": "Client travel",
        },
    )
    assert trip_response.status_code == 201
    trip = trip_response.json()
    assert trip["status"] == "requested"
    assert json.loads((tmp_path / "trips.json").read_text())[0]["status"] == "requested"

    approval_response = client.post(
        f"/api/v1/trips/{trip['id']}/approve",
        json={
            "aircraft_id": aircraft["id"],
            "pilot_ids": [pilot["id"]],
            "approved_by": "Dispatch",
        },
    )
    assert approval_response.status_code == 200
    assert approval_response.json()["status"] == "approved"

    flight_response = client.post(
        "/api/v1/flights",
        json={
            "trip_id": trip["id"],
            "flight_number": "PG101",
            "aircraft_id": aircraft["id"],
            "pilot_ids": [pilot["id"]],
            "origin": "KTEB",
            "destination": "KPBI",
            "scheduled_departure": "2030-08-01T09:00:00-04:00",
            "scheduled_arrival": "2030-08-01T11:45:00-04:00",
            "passengers": 5,
        },
    )
    assert flight_response.status_code == 201
    flight = flight_response.json()

    departed = client.post(
        f"/api/v1/flights/{flight['id']}/status",
        json={"status": "departed", "occurred_at": "2030-08-01T09:06:00-04:00"},
    )
    assert departed.status_code == 200
    completed = client.post(
        f"/api/v1/flights/{flight['id']}/status",
        json={"status": "completed", "occurred_at": "2030-08-01T11:42:00-04:00"},
    )
    assert completed.status_code == 200
    assert completed.json()["actual_arrival"] is not None

    fuel_response = client.post(
        "/api/v1/fuel-logs",
        json={
            "aircraft_id": aircraft["id"],
            "flight_id": flight["id"],
            "airport": "KPBI",
            "fueled_at": "2030-08-01T12:00:00-04:00",
            "gallons": 310.5,
            "price_per_gallon": 6.25,
            "vendor": "Atlantic Aviation",
        },
    )
    assert fuel_response.status_code == 201
    assert fuel_response.json()["total_cost"] == 1940.62

    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard == {
        "pilots": 1,
        "active_pilots": 1,
        "aircraft": 1,
        "available_aircraft": 1,
        "requested_trips": 0,
        "approved_trips": 1,
        "scheduled_flights": 0,
        "fuel_gallons": 310.5,
        "fuel_cost": 1940.62,
    }

    restarted_client = build_client(tmp_path)
    assert restarted_client.get(f"/api/v1/trips/{trip['id']}").json()["status"] == "approved"
    assert len(restarted_client.get("/api/v1/fuel-logs").json()) == 1
    assert len(json.loads((tmp_path / "trips.json").read_text())) == 1


def test_rejects_schedule_conflicts_and_duplicate_identifiers(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    pilot = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Morgan",
            "last_name": "Lee",
            "email": "morgan@example.com",
            "license_number": "ATP-2002",
            "medical_expires": "2031-01-01",
        },
    ).json()
    duplicate = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Another",
            "last_name": "Pilot",
            "email": "MORGAN@example.com",
            "license_number": "ATP-3003",
        },
    )
    assert duplicate.status_code == 409

    aircraft = client.post(
        "/api/v1/aircraft",
        json={
            "tail_number": "N456PG",
            "make": "Embraer",
            "model": "Phenom 300",
            "passenger_capacity": 8,
            "home_airport": "KHPN",
        },
    ).json()

    trip_ids = []
    for customer in ("First Customer", "Second Customer"):
        response = client.post(
            "/api/v1/trips",
            json={
                "customer_name": customer,
                "origin": "KHPN",
                "destination": "KBOS",
                "departure_at": "2030-09-10T10:00:00-04:00",
                "return_at": "2030-09-10T15:00:00-04:00",
                "passengers": 4,
            },
        )
        trip_ids.append(response.json()["id"])

    assignment = {
        "aircraft_id": aircraft["id"],
        "pilot_ids": [pilot["id"]],
        "approved_by": "Dispatcher",
    }
    assert client.post(f"/api/v1/trips/{trip_ids[0]}/approve", json=assignment).status_code == 200
    conflict = client.post(f"/api/v1/trips/{trip_ids[1]}/approve", json=assignment)
    assert conflict.status_code == 409
    assert "conflicting" in conflict.json()["detail"]
