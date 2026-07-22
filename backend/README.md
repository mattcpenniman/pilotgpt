# PilotGPT Jet Scheduling API

A demo FastAPI backend for managing pilots, aircraft, requested/approved trips, flight legs, and fuel purchases. Records are persisted as readable JSON arrays in `data/`; writes use an atomic temp-file swap so an interrupted write does not leave half-written JSON.

## Run it

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Open interactive API documentation at <http://localhost:8000/docs> or the OpenAPI document at <http://localhost:8000/openapi.json>.

To store data elsewhere, set `PILOTGPT_DATA_DIR`. Set comma-separated `CORS_ORIGINS` to allow additional frontend origins; it defaults to `http://localhost:3000`.

## Airport reference data

Airport lookup and distance endpoints use the public-domain OurAirports dataset. Download its nightly `airports.csv` file before using those endpoints:

```bash
cd backend
python3 scripts/download_airports.py
```

This writes `data/airports.csv`, which is intentionally ignored by Git. If `PILOTGPT_DATA_DIR` points elsewhere, download the file and place it at `$PILOTGPT_DATA_DIR/airports.csv`. Missing or invalid data returns an actionable `503` only from airport endpoints; scheduling remains available. Download the file before `docker compose up --build` because Compose mounts `backend/data/` into the backend container.

OurAirports data is updated nightly and is provided without an accuracy or fitness guarantee. Distances are Haversine great-circle distances in nautical miles, not airway routes, flight plans, or flight-time estimates.

## Main routes

- `GET /health` — liveness check
- `GET /api/v1/dashboard` — fleet/operations totals
- `/api/v1/pilots` — list, create, read, update, and delete pilots
- `/api/v1/aircraft` — list, create, read, update, and delete aircraft
- `GET /api/v1/airports?query=...` — search airport codes, names, and municipalities
- `GET /api/v1/airports/{code}` — resolve an ICAO, GPS, IATA, or local code
- `GET /api/v1/airports/distance?origin=...&destination=...` — calculate great-circle distance
- `/api/v1/trips` — request, edit, list, read, and delete trips
- `POST /api/v1/trips/{id}/approve` — assign aircraft/crew and approve
- `POST /api/v1/trips/{id}/reject` and `/cancel` — trip workflow actions
- `/api/v1/flights` — flight-leg CRUD and filters
- `POST /api/v1/flights/{id}/status` — scheduled → departed → completed workflow, or cancellation
- `/api/v1/fuel-logs` — fuel purchase CRUD and calculated total cost
- `POST /api/v1/trips/{id}/reschedule-requests` — record requested trip itinerary changes
- `POST /api/v1/flights/{id}/reschedule-requests` — record requested flight schedule changes
- `/api/v1/reschedule-requests` — filterable historical reschedule reporting and resolution

Trip approval verifies pilot status/medical validity, aircraft capacity/status, and scheduling conflicts. Flight scheduling verifies the approved assignment (when tied to a trip) and blocks aircraft or pilot overlaps. All datetimes must contain a timezone offset.

Reschedule requests preserve who requested the change, their contact information and reason, the original values, desired values, and an append-only event history. Approving a request validates and applies the requested values; declining it leaves the schedule unchanged. Both outcomes remain available for historical reporting.

## Test it

```bash
cd backend
.venv/bin/pytest -q
```

This is intentionally demo storage. Multiple processes should not write these files concurrently; use a transactional database before production deployment.
