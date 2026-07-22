from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    Aircraft, AircraftCreate, AircraftStatus, AircraftUpdate, Dashboard,
    Flight, FlightCreate, FlightStatus, FlightStatusUpdate, FlightUpdate,
    FuelLog, FuelLogCreate, FuelLogUpdate, Pilot, PilotCreate, PilotUpdate,
    Trip, TripApproval, TripCreate, TripRejection, TripStatus, TripUpdate,
)
from .service import SchedulingService
from .storage import JsonStore

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def create_app(data_dir: Path | None = None) -> FastAPI:
    resolved_data_dir = data_dir or Path(os.getenv("PILOTGPT_DATA_DIR", DEFAULT_DATA_DIR))
    service = SchedulingService(JsonStore(resolved_data_dir))
    app = FastAPI(
        title="PilotGPT Jet Scheduling API",
        version="1.0.0",
        description="Demo API for pilots, aircraft, trip approvals, flights, and fuel records.",
    )
    app.state.service = service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    router = APIRouter(prefix="/api/v1")

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/dashboard", response_model=Dashboard, tags=["dashboard"])
    def dashboard() -> Dashboard:
        return service.dashboard()

    @router.get("/pilots", response_model=list[Pilot], tags=["pilots"])
    def list_pilots(active: bool | None = None) -> list[Pilot]:
        records = service.list("pilots", Pilot)
        return [item for item in records if active is None or item.active == active]

    @router.post("/pilots", response_model=Pilot, status_code=status.HTTP_201_CREATED, tags=["pilots"])
    def create_pilot(payload: PilotCreate) -> Pilot:
        service.ensure_unique("pilots", "email", str(payload.email))
        service.ensure_unique("pilots", "license_number", payload.license_number)
        return service.create("pilots", payload, Pilot)

    @router.get("/pilots/{pilot_id}", response_model=Pilot, tags=["pilots"])
    def get_pilot(pilot_id: str) -> Pilot:
        return service.get("pilots", pilot_id, Pilot)

    @router.patch("/pilots/{pilot_id}", response_model=Pilot, tags=["pilots"])
    def update_pilot(pilot_id: str, payload: PilotUpdate) -> Pilot:
        if payload.email is not None:
            service.ensure_unique("pilots", "email", str(payload.email), pilot_id)
        if payload.license_number is not None:
            service.ensure_unique("pilots", "license_number", payload.license_number, pilot_id)
        return service.update("pilots", pilot_id, payload, Pilot)

    @router.delete("/pilots/{pilot_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["pilots"])
    def delete_pilot(pilot_id: str) -> Response:
        service.delete("pilots", pilot_id, Pilot)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/aircraft", response_model=list[Aircraft], tags=["aircraft"])
    def list_aircraft(aircraft_status: AircraftStatus | None = Query(default=None, alias="status")) -> list[Aircraft]:
        records = service.list("aircraft", Aircraft)
        return [item for item in records if aircraft_status is None or item.status == aircraft_status]

    @router.post("/aircraft", response_model=Aircraft, status_code=status.HTTP_201_CREATED, tags=["aircraft"])
    def create_aircraft(payload: AircraftCreate) -> Aircraft:
        service.ensure_unique("aircraft", "tail_number", payload.tail_number)
        return service.create("aircraft", payload, Aircraft)

    @router.get("/aircraft/{aircraft_id}", response_model=Aircraft, tags=["aircraft"])
    def get_aircraft(aircraft_id: str) -> Aircraft:
        return service.get("aircraft", aircraft_id, Aircraft)

    @router.patch("/aircraft/{aircraft_id}", response_model=Aircraft, tags=["aircraft"])
    def update_aircraft(aircraft_id: str, payload: AircraftUpdate) -> Aircraft:
        if payload.tail_number is not None:
            service.ensure_unique("aircraft", "tail_number", payload.tail_number, aircraft_id)
        return service.update("aircraft", aircraft_id, payload, Aircraft)

    @router.delete("/aircraft/{aircraft_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["aircraft"])
    def delete_aircraft(aircraft_id: str) -> Response:
        service.delete("aircraft", aircraft_id, Aircraft)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/trips", response_model=list[Trip], tags=["trips"])
    def list_trips(trip_status: TripStatus | None = Query(default=None, alias="status")) -> list[Trip]:
        records = service.list("trips", Trip)
        return [item for item in records if trip_status is None or item.status == trip_status]

    @router.post("/trips", response_model=Trip, status_code=status.HTTP_201_CREATED, tags=["trips"])
    def request_trip(payload: TripCreate) -> Trip:
        return service.create("trips", payload, Trip)

    @router.get("/trips/{trip_id}", response_model=Trip, tags=["trips"])
    def get_trip(trip_id: str) -> Trip:
        return service.get("trips", trip_id, Trip)

    @router.patch("/trips/{trip_id}", response_model=Trip, tags=["trips"])
    def update_trip(trip_id: str, payload: TripUpdate) -> Trip:
        trip = service.get("trips", trip_id, Trip)
        if trip.status != TripStatus.REQUESTED:
            raise HTTPException(status_code=409, detail="Only requested trips can be edited")
        candidate = trip.model_copy(update=payload.model_dump(exclude_unset=True))
        service.validate_trip(candidate)
        return service.update("trips", trip_id, payload, Trip)

    @router.post("/trips/{trip_id}/approve", response_model=Trip, tags=["trips"])
    def approve_trip(trip_id: str, payload: TripApproval) -> Trip:
        return service.approve_trip(trip_id, payload)

    @router.post("/trips/{trip_id}/reject", response_model=Trip, tags=["trips"])
    def reject_trip(trip_id: str, payload: TripRejection) -> Trip:
        return service.reject_trip(trip_id, payload.reason)

    @router.post("/trips/{trip_id}/cancel", response_model=Trip, tags=["trips"])
    def cancel_trip(trip_id: str) -> Trip:
        return service.cancel_trip(trip_id)

    @router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["trips"])
    def delete_trip(trip_id: str) -> Response:
        service.delete("trips", trip_id, Trip)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/flights", response_model=list[Flight], tags=["flights"])
    def list_flights(
        flight_status: FlightStatus | None = Query(default=None, alias="status"),
        trip_id: str | None = None,
        aircraft_id: str | None = None,
    ) -> list[Flight]:
        records = service.list("flights", Flight)
        return [
            item for item in records
            if (flight_status is None or item.status == flight_status)
            and (trip_id is None or item.trip_id == trip_id)
            and (aircraft_id is None or item.aircraft_id == aircraft_id)
        ]

    @router.post("/flights", response_model=Flight, status_code=status.HTTP_201_CREATED, tags=["flights"])
    def create_flight(payload: FlightCreate) -> Flight:
        service.ensure_unique("flights", "flight_number", payload.flight_number)
        service.validate_flight(payload)
        return service.create("flights", payload, Flight)

    @router.get("/flights/{flight_id}", response_model=Flight, tags=["flights"])
    def get_flight(flight_id: str) -> Flight:
        return service.get("flights", flight_id, Flight)

    @router.patch("/flights/{flight_id}", response_model=Flight, tags=["flights"])
    def update_flight(flight_id: str, payload: FlightUpdate) -> Flight:
        existing = service.get("flights", flight_id, Flight)
        if existing.status != FlightStatus.SCHEDULED:
            raise HTTPException(status_code=409, detail="Only scheduled flights can be edited")
        if payload.flight_number is not None:
            service.ensure_unique("flights", "flight_number", payload.flight_number, flight_id)
        candidate = existing.model_copy(update=payload.model_dump(exclude_unset=True))
        service.validate_flight(candidate, exclude_id=flight_id)
        return service.update("flights", flight_id, payload, Flight)

    @router.post("/flights/{flight_id}/status", response_model=Flight, tags=["flights"])
    def change_flight_status(flight_id: str, payload: FlightStatusUpdate) -> Flight:
        return service.change_flight_status(flight_id, payload.status, payload.occurred_at)

    @router.delete("/flights/{flight_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["flights"])
    def delete_flight(flight_id: str) -> Response:
        service.delete("flights", flight_id, Flight)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/fuel-logs", response_model=list[FuelLog], tags=["fuel"])
    def list_fuel_logs(aircraft_id: str | None = None, flight_id: str | None = None) -> list[FuelLog]:
        records = service.list("fuel_logs", FuelLog)
        return [
            item for item in records
            if (aircraft_id is None or item.aircraft_id == aircraft_id)
            and (flight_id is None or item.flight_id == flight_id)
        ]

    @router.post("/fuel-logs", response_model=FuelLog, status_code=status.HTTP_201_CREATED, tags=["fuel"])
    def create_fuel_log(payload: FuelLogCreate) -> FuelLog:
        service.validate_fuel_log(payload)
        return service.create("fuel_logs", payload, FuelLog)

    @router.get("/fuel-logs/{fuel_log_id}", response_model=FuelLog, tags=["fuel"])
    def get_fuel_log(fuel_log_id: str) -> FuelLog:
        return service.get("fuel_logs", fuel_log_id, FuelLog)

    @router.patch("/fuel-logs/{fuel_log_id}", response_model=FuelLog, tags=["fuel"])
    def update_fuel_log(fuel_log_id: str, payload: FuelLogUpdate) -> FuelLog:
        existing = service.get("fuel_logs", fuel_log_id, FuelLog)
        candidate = existing.model_copy(update=payload.model_dump(exclude_unset=True))
        service.validate_fuel_log(candidate)
        return service.update("fuel_logs", fuel_log_id, payload, FuelLog)

    @router.delete("/fuel-logs/{fuel_log_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["fuel"])
    def delete_fuel_log(fuel_log_id: str) -> Response:
        service.delete("fuel_logs", fuel_log_id, FuelLog)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    app.include_router(router)
    return app


app = create_app()
