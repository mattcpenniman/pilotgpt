from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, TypeVar
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import BaseModel

from .models import (
    Aircraft,
    AircraftStatus,
    Dashboard,
    Flight,
    FlightCreate,
    FlightStatus,
    FuelLog,
    Pilot,
    Trip,
    TripApproval,
    TripStatus,
    utc_now,
)
from .storage import JsonStore


ModelT = TypeVar("ModelT", bound=BaseModel)


class SchedulingService:
    def __init__(self, store: JsonStore):
        self.store = store

    def list(self, collection: str, model: type[ModelT]) -> list[ModelT]:
        return [model.model_validate(item) for item in self.store.all(collection)]

    def get(self, collection: str, record_id: str, model: type[ModelT]) -> ModelT:
        record = self.store.get(collection, record_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"{collection.rstrip('s')} not found")
        return model.model_validate(record)

    def create(self, collection: str, payload: BaseModel, model: type[ModelT]) -> ModelT:
        now = utc_now()
        record = payload.model_dump(mode="json") | {
            "id": str(uuid4()),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        created = model.model_validate(record)
        self.store.create(collection, created.model_dump(mode="json", exclude={"total_cost"}))
        return created

    def update(self, collection: str, record_id: str, payload: BaseModel, model: type[ModelT]) -> ModelT:
        existing = self.get(collection, record_id, model)
        changes = payload.model_dump(mode="json", exclude_unset=True)
        record = existing.model_dump(mode="json", exclude={"total_cost"}) | changes | {"updated_at": utc_now().isoformat()}
        updated = model.model_validate(record)
        self.store.replace(collection, record_id, updated.model_dump(mode="json", exclude={"total_cost"}))
        return updated

    def delete(self, collection: str, record_id: str, model: type[ModelT]) -> None:
        self.get(collection, record_id, model)
        self.store.delete(collection, record_id)

    def ensure_unique(self, collection: str, field: str, value: str, exclude_id: str | None = None) -> None:
        normalized = value.casefold()
        for record in self.store.all(collection):
            if record["id"] != exclude_id and str(record.get(field, "")).casefold() == normalized:
                raise HTTPException(status_code=409, detail=f"{field} already exists")

    def validate_trip(self, trip: Trip) -> None:
        if trip.return_at and trip.return_at <= trip.departure_at:
            raise HTTPException(status_code=422, detail="return_at must be after departure_at")
        if trip.origin == trip.destination:
            raise HTTPException(status_code=422, detail="origin and destination must differ")

    @staticmethod
    def overlaps(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
        return start_a < end_b and start_b < end_a

    def _trip_end(self, trip: Trip) -> datetime:
        return trip.return_at or trip.departure_at + timedelta(hours=1)

    def approve_trip(self, trip_id: str, approval: TripApproval) -> Trip:
        trip = self.get("trips", trip_id, Trip)
        if trip.status != TripStatus.REQUESTED:
            raise HTTPException(status_code=409, detail="Only requested trips can be approved")
        aircraft = self.get("aircraft", approval.aircraft_id, Aircraft)
        if aircraft.status != AircraftStatus.AVAILABLE:
            raise HTTPException(status_code=409, detail="Aircraft is not available")
        if aircraft.passenger_capacity < trip.passengers:
            raise HTTPException(status_code=409, detail="Aircraft passenger capacity is too small")

        for pilot_id in approval.pilot_ids:
            pilot = self.get("pilots", pilot_id, Pilot)
            if not pilot.active:
                raise HTTPException(status_code=409, detail=f"Pilot {pilot_id} is inactive")
            if pilot.medical_expires and pilot.medical_expires < trip.departure_at.date():
                raise HTTPException(status_code=409, detail=f"Pilot {pilot_id} medical certificate is expired")

        requested_end = self._trip_end(trip)
        for other in self.list("trips", Trip):
            if other.id == trip.id or other.status != TripStatus.APPROVED:
                continue
            if not self.overlaps(trip.departure_at, requested_end, other.departure_at, self._trip_end(other)):
                continue
            if other.aircraft_id == approval.aircraft_id:
                raise HTTPException(status_code=409, detail="Aircraft has a conflicting approved trip")
            if set(other.pilot_ids) & set(approval.pilot_ids):
                raise HTTPException(status_code=409, detail="A pilot has a conflicting approved trip")

        now = utc_now()
        record = trip.model_dump(mode="json") | {
            "status": TripStatus.APPROVED,
            "aircraft_id": approval.aircraft_id,
            "pilot_ids": approval.pilot_ids,
            "approved_by": approval.approved_by,
            "approved_at": now.isoformat(),
            "rejected_reason": None,
            "updated_at": now.isoformat(),
        }
        approved = Trip.model_validate(record)
        self.store.replace("trips", trip_id, approved.model_dump(mode="json"))
        return approved

    def reject_trip(self, trip_id: str, reason: str) -> Trip:
        trip = self.get("trips", trip_id, Trip)
        if trip.status != TripStatus.REQUESTED:
            raise HTTPException(status_code=409, detail="Only requested trips can be rejected")
        record = trip.model_dump(mode="json") | {
            "status": TripStatus.REJECTED,
            "rejected_reason": reason,
            "updated_at": utc_now().isoformat(),
        }
        rejected = Trip.model_validate(record)
        self.store.replace("trips", trip_id, rejected.model_dump(mode="json"))
        return rejected

    def cancel_trip(self, trip_id: str) -> Trip:
        trip = self.get("trips", trip_id, Trip)
        if trip.status == TripStatus.CANCELLED:
            return trip
        if trip.status == TripStatus.REJECTED:
            raise HTTPException(status_code=409, detail="Rejected trips cannot be cancelled")
        record = trip.model_dump(mode="json") | {
            "status": TripStatus.CANCELLED,
            "updated_at": utc_now().isoformat(),
        }
        cancelled = Trip.model_validate(record)
        self.store.replace("trips", trip_id, cancelled.model_dump(mode="json"))
        return cancelled

    def validate_flight(self, flight: FlightCreate | Flight, exclude_id: str | None = None) -> None:
        if flight.scheduled_departure.tzinfo is None or flight.scheduled_arrival.tzinfo is None:
            raise HTTPException(status_code=422, detail="Flight datetimes must include a timezone offset")
        if flight.scheduled_arrival <= flight.scheduled_departure:
            raise HTTPException(status_code=422, detail="scheduled_arrival must be after scheduled_departure")
        if flight.origin == flight.destination:
            raise HTTPException(status_code=422, detail="origin and destination must differ")
        if len(flight.pilot_ids) != len(set(flight.pilot_ids)):
            raise HTTPException(status_code=422, detail="pilot_ids must be unique")
        aircraft = self.get("aircraft", flight.aircraft_id, Aircraft)
        if aircraft.status == AircraftStatus.OUT_OF_SERVICE:
            raise HTTPException(status_code=409, detail="Aircraft is out of service")
        if aircraft.passenger_capacity < flight.passengers:
            raise HTTPException(status_code=409, detail="Aircraft passenger capacity is too small")
        for pilot_id in flight.pilot_ids:
            pilot = self.store.get("pilots", pilot_id)
            if not pilot:
                raise HTTPException(status_code=404, detail=f"Pilot {pilot_id} not found")
            if not pilot.get("active", False):
                raise HTTPException(status_code=409, detail=f"Pilot {pilot_id} is inactive")
        if flight.trip_id:
            trip = self.get("trips", flight.trip_id, Trip)
            if trip.status != TripStatus.APPROVED:
                raise HTTPException(status_code=409, detail="Flights require an approved trip")
            if trip.aircraft_id != flight.aircraft_id or not set(flight.pilot_ids).issubset(trip.pilot_ids):
                raise HTTPException(status_code=409, detail="Flight crew and aircraft must match its approved trip")
        for other in self.list("flights", Flight):
            if other.id == exclude_id or other.status == FlightStatus.CANCELLED:
                continue
            if not self.overlaps(
                flight.scheduled_departure,
                flight.scheduled_arrival,
                other.scheduled_departure,
                other.scheduled_arrival,
            ):
                continue
            if other.aircraft_id == flight.aircraft_id:
                raise HTTPException(status_code=409, detail="Aircraft has a conflicting flight")
            if set(other.pilot_ids) & set(flight.pilot_ids):
                raise HTTPException(status_code=409, detail="A pilot has a conflicting flight")

    def change_flight_status(self, flight_id: str, new_status: FlightStatus, occurred_at: datetime | None) -> Flight:
        flight = self.get("flights", flight_id, Flight)
        if occurred_at is not None and occurred_at.tzinfo is None:
            raise HTTPException(status_code=422, detail="occurred_at must include a timezone offset")
        allowed = {
            FlightStatus.SCHEDULED: {FlightStatus.DEPARTED, FlightStatus.CANCELLED},
            FlightStatus.DEPARTED: {FlightStatus.COMPLETED},
            FlightStatus.COMPLETED: set(),
            FlightStatus.CANCELLED: set(),
        }
        if new_status == flight.status:
            return flight
        if new_status not in allowed[flight.status]:
            raise HTTPException(status_code=409, detail=f"Cannot change flight from {flight.status} to {new_status}")
        now = occurred_at or utc_now()
        changes: dict[str, Any] = {"status": new_status, "updated_at": utc_now().isoformat()}
        if new_status == FlightStatus.DEPARTED:
            changes["actual_departure"] = now.isoformat()
        elif new_status == FlightStatus.COMPLETED:
            changes["actual_arrival"] = now.isoformat()
        record = flight.model_dump(mode="json") | changes
        updated = Flight.model_validate(record)
        self.store.replace("flights", flight_id, updated.model_dump(mode="json", exclude={"total_cost"}))
        return updated

    def validate_fuel_log(self, fuel_log: BaseModel) -> None:
        if fuel_log.fueled_at.tzinfo is None:
            raise HTTPException(status_code=422, detail="fueled_at must include a timezone offset")
        self.get("aircraft", fuel_log.aircraft_id, Aircraft)
        if fuel_log.flight_id:
            flight = self.get("flights", fuel_log.flight_id, Flight)
            if flight.aircraft_id != fuel_log.aircraft_id:
                raise HTTPException(status_code=409, detail="Fuel log aircraft does not match flight aircraft")

    def dashboard(self) -> Dashboard:
        pilots = self.store.all("pilots")
        aircraft = self.store.all("aircraft")
        trips = self.store.all("trips")
        flights = self.store.all("flights")
        fuel_logs = [FuelLog.model_validate(item) for item in self.store.all("fuel_logs")]
        return Dashboard(
            pilots=len(pilots),
            active_pilots=sum(item["active"] for item in pilots),
            aircraft=len(aircraft),
            available_aircraft=sum(item["status"] == AircraftStatus.AVAILABLE for item in aircraft),
            requested_trips=sum(item["status"] == TripStatus.REQUESTED for item in trips),
            approved_trips=sum(item["status"] == TripStatus.APPROVED for item in trips),
            scheduled_flights=sum(item["status"] == FlightStatus.SCHEDULED for item in flights),
            fuel_gallons=round(sum(item.gallons for item in fuel_logs), 2),
            fuel_cost=round(sum(item.total_cost for item in fuel_logs), 2),
        )
