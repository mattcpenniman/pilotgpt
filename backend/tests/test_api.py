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


def test_reschedule_requests_apply_changes_and_preserve_history(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    trip = client.post(
        "/api/v1/trips",
        json={
            "customer_name": "Northwind Aviation",
            "customer_email": "ops@northwind.example",
            "origin": "KTEB",
            "destination": "KPBI",
            "departure_at": "2030-08-01T09:00:00-04:00",
            "return_at": "2030-08-03T16:00:00-04:00",
            "passengers": 5,
        },
    ).json()

    requested = client.post(
        f"/api/v1/trips/{trip['id']}/reschedule-requests",
        json={
            "requested_by": "Jordan Lee",
            "requester_contact": "jordan@example.com",
            "reason": "The customer needs to attend a later meeting.",
            "requested_changes": {
                "departure_at": "2030-08-02T11:30:00-04:00",
                "return_at": "2030-08-04T18:00:00-04:00",
            },
        },
    )
    assert requested.status_code == 201
    request = requested.json()
    assert request["target_type"] == "trip"
    assert request["status"] == "pending"
    assert request["requested_by"] == "Jordan Lee"
    assert request["reason"] == "The customer needs to attend a later meeting."
    assert request["original_values"]["departure_at"] == "2030-08-01T09:00:00-04:00"
    assert request["requested_changes"]["departure_at"] == "2030-08-02T11:30:00-04:00"
    assert request["history"][0]["event_type"] == "requested"
    assert {change["field"] for change in request["history"][0]["changes"]} == {
        "departure_at",
        "return_at",
    }
    assert client.get(f"/api/v1/trips/{trip['id']}").json()["sub_status"] == "pending_reschedule"

    duplicate = client.post(
        f"/api/v1/trips/{trip['id']}/reschedule-requests",
        json={
            "requested_by": "Jordan Lee",
            "reason": "Another preference",
            "requested_changes": {"departure_at": "2030-08-03T09:00:00-04:00"},
        },
    )
    assert duplicate.status_code == 409

    report = client.get(
        "/api/v1/reschedule-requests",
        params={"trip_id": trip["id"], "status": "pending"},
    )
    assert report.status_code == 200
    assert [item["id"] for item in report.json()] == [request["id"]]

    resolved = client.post(
        f"/api/v1/reschedule-requests/{request['id']}/resolve",
        json={
            "status": "approved",
            "resolved_by": "Maya Brooks, Dispatch",
            "note": "Requested times are available.",
        },
    )
    assert resolved.status_code == 200
    resolution = resolved.json()
    assert resolution["status"] == "approved"
    assert resolution["resolved_at"] is not None
    assert [event["event_type"] for event in resolution["history"]] == ["requested", "applied"]
    applied_changes = {change["field"]: change for change in resolution["history"][1]["changes"]}
    assert applied_changes["status"] == {"field": "status", "before": "pending", "after": "approved"}
    assert applied_changes["departure_at"]["before"] == "2030-08-01T09:00:00-04:00"
    assert applied_changes["departure_at"]["after"] == "2030-08-02T11:30:00-04:00"

    updated_trip = client.get(f"/api/v1/trips/{trip['id']}").json()
    assert updated_trip["departure_at"] == "2030-08-02T11:30:00-04:00"
    assert updated_trip["return_at"] == "2030-08-04T18:00:00-04:00"
    assert updated_trip["sub_status"] is None
    assert client.post(
        f"/api/v1/reschedule-requests/{request['id']}/resolve",
        json={"status": "declined", "resolved_by": "Another dispatcher"},
    ).status_code == 409

    persisted = json.loads((tmp_path / "reschedule_requests.json").read_text())
    assert persisted[0]["history"][0]["changes"][0]["before"] is not None
    restarted_client = build_client(tmp_path)
    historical = restarted_client.get(f"/api/v1/reschedule-requests/{request['id']}")
    assert historical.status_code == 200
    assert len(historical.json()["history"]) == 2


def test_flight_reschedule_decline_records_request_without_changing_schedule(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    pilot = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Avery",
            "last_name": "Stone",
            "email": "avery@example.com",
            "license_number": "ATP-1001",
            "medical_expires": "2031-01-01",
        },
    ).json()
    aircraft = client.post(
        "/api/v1/aircraft",
        json={
            "tail_number": "N123PG",
            "make": "Cessna",
            "model": "Citation Latitude",
            "passenger_capacity": 9,
            "home_airport": "KTEB",
        },
    ).json()
    trip = client.post(
        "/api/v1/trips",
        json={
            "customer_name": "Contoso",
            "origin": "KTEB",
            "destination": "KBOS",
            "departure_at": "2030-09-01T09:00:00-04:00",
            "passengers": 4,
        },
    ).json()
    client.post(
        f"/api/v1/trips/{trip['id']}/approve",
        json={"aircraft_id": aircraft["id"], "pilot_ids": [pilot["id"]], "approved_by": "Dispatch"},
    )
    flight = client.post(
        "/api/v1/flights",
        json={
            "trip_id": trip["id"],
            "flight_number": "PG401",
            "aircraft_id": aircraft["id"],
            "pilot_ids": [pilot["id"]],
            "origin": "KTEB",
            "destination": "KBOS",
            "scheduled_departure": "2030-09-01T09:00:00-04:00",
            "scheduled_arrival": "2030-09-01T10:15:00-04:00",
            "passengers": 4,
        },
    ).json()

    request = client.post(
        f"/api/v1/flights/{flight['id']}/reschedule-requests",
        json={
            "requested_by": "Customer concierge",
            "reason": "Passenger requested a later departure.",
            "requested_changes": {
                "scheduled_departure": "2030-09-01T11:00:00-04:00",
                "scheduled_arrival": "2030-09-01T12:15:00-04:00",
            },
        },
    ).json()
    assert client.get(f"/api/v1/flights/{flight['id']}").json()["sub_status"] == "pending_reschedule"

    declined = client.post(
        f"/api/v1/reschedule-requests/{request['id']}/resolve",
        json={
            "status": "declined",
            "resolved_by": "Dispatch",
            "note": "Crew duty limits prevent the requested time.",
        },
    )
    assert declined.status_code == 200
    assert declined.json()["history"][-1]["note"] == "Crew duty limits prevent the requested time."
    unchanged = client.get(f"/api/v1/flights/{flight['id']}").json()
    assert unchanged["scheduled_departure"] == "2030-09-01T09:00:00-04:00"
    assert unchanged["sub_status"] is None


def test_trip_card_substatus_and_requested_trip_editing(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    trip = client.post(
        "/api/v1/trips",
        json={
            "customer_name": "Original Customer",
            "origin": "KTEB",
            "destination": "KPBI",
            "departure_at": "2030-08-01T09:00:00-04:00",
            "passengers": 3,
        },
    ).json()

    edited = client.patch(
        f"/api/v1/trips/{trip['id']}",
        json={
            "customer_name": "Updated Customer",
            "destination": "KBOS",
            "sub_status": "needs_rescheduling",
        },
    )
    assert edited.status_code == 200
    assert edited.json()["customer_name"] == "Updated Customer"
    assert edited.json()["destination"] == "KBOS"
    assert edited.json()["sub_status"] == "needs_rescheduling"

    cleared = client.patch(f"/api/v1/trips/{trip['id']}", json={"sub_status": None})
    assert cleared.status_code == 200
    assert cleared.json()["sub_status"] is None
    assert client.patch(
        f"/api/v1/trips/{trip['id']}",
        json={"sub_status": "pending_reschedule"},
    ).status_code == 422


def test_approved_trip_allows_substatus_and_more_than_two_flight_legs(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    pilot = client.post(
        "/api/v1/pilots",
        json={
            "first_name": "Avery",
            "last_name": "Stone",
            "email": "avery@example.com",
            "license_number": "ATP-9001",
            "medical_expires": "2031-01-01",
        },
    ).json()
    aircraft = client.post(
        "/api/v1/aircraft",
        json={
            "tail_number": "N900PG",
            "make": "Cessna",
            "model": "Citation Latitude",
            "passenger_capacity": 9,
            "home_airport": "KTEB",
        },
    ).json()
    trip = client.post(
        "/api/v1/trips",
        json={
            "customer_name": "Multi Leg Customer",
            "origin": "KTEB",
            "destination": "KPBI",
            "departure_at": "2030-08-01T09:00:00-04:00",
            "return_at": "2030-08-04T18:00:00-04:00",
            "passengers": 3,
        },
    ).json()
    client.post(
        f"/api/v1/trips/{trip['id']}/approve",
        json={"aircraft_id": aircraft["id"], "pilot_ids": [pilot["id"]], "approved_by": "Dispatch"},
    )

    status_update = client.patch(
        f"/api/v1/trips/{trip['id']}",
        json={"sub_status": "pending_cancellation"},
    )
    assert status_update.status_code == 200
    assert status_update.json()["sub_status"] == "pending_cancellation"
    blocked_edit = client.patch(f"/api/v1/trips/{trip['id']}", json={"passengers": 4})
    assert blocked_edit.status_code == 409
    assert "reschedule request" in blocked_edit.json()["detail"]

    legs = [
        ("PG501", "KTEB", "KORD", "2030-08-01T09:00:00-04:00", "2030-08-01T11:00:00-04:00"),
        ("PG502", "KORD", "KDEN", "2030-08-01T13:00:00-04:00", "2030-08-01T15:00:00-04:00"),
        ("PG503", "KDEN", "KPBI", "2030-08-02T09:00:00-04:00", "2030-08-02T13:00:00-04:00"),
    ]
    for number, origin, destination, departure, arrival in legs:
        response = client.post(
            "/api/v1/flights",
            json={
                "trip_id": trip["id"],
                "flight_number": number,
                "aircraft_id": aircraft["id"],
                "pilot_ids": [pilot["id"]],
                "origin": origin,
                "destination": destination,
                "scheduled_departure": departure,
                "scheduled_arrival": arrival,
                "passengers": 3,
            },
        )
        assert response.status_code == 201

    linked = client.get("/api/v1/flights", params={"trip_id": trip["id"]})
    assert len(linked.json()) == 3
