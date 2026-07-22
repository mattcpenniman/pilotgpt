from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, TypeVar
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError

from .airports import AirportCatalog
from .models import (
    Aircraft,
    AircraftStatus,
    Dashboard,
    Flight,
    FlightCreate,
    FlightRescheduleRequestCreate,
    FlightStatus,
    FuelLog,
    Pilot,
    RescheduleChange,
    RescheduleEvent,
    RescheduleRequest,
    RescheduleResolution,
    RescheduleStatus,
    RescheduleTarget,
    Trip,
    TripApproval,
    TripRescheduleRequestCreate,
    TripStatus,
    TripUpdate,
    WorkflowSubStatus,
    utc_now,
)
from .storage import JsonStore


ModelT = TypeVar("ModelT", bound=BaseModel)


class SchedulingService:
    FLIGHT_GROUND_ALLOWANCE_MINUTES = 30

    def __init__(self, store: JsonStore, airports: AirportCatalog | None = None):
        self.store = store
        self.airports = airports

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

    def update_trip(self, trip_id: str, payload: TripUpdate) -> Trip:
        trip = self.get("trips", trip_id, Trip)
        fields = payload.model_fields_set
        if trip.status in {TripStatus.REJECTED, TripStatus.CANCELLED}:
            raise HTTPException(status_code=409, detail=f"{trip.status.capitalize()} trips cannot be edited")
        if trip.status == TripStatus.APPROVED and fields - {"sub_status"}:
            raise HTTPException(
                status_code=409,
                detail="Approved trip itinerary changes require a reschedule request",
            )
        if payload.sub_status == WorkflowSubStatus.PENDING_RESCHEDULE:
            raise HTTPException(status_code=422, detail="pending_reschedule is managed by reschedule requests")
        try:
            candidate = Trip.model_validate(trip.model_dump() | payload.model_dump(exclude_unset=True))
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()[0]["msg"]) from exc
        self.validate_trip(candidate)
        return self.update("trips", trip_id, payload, Trip)

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
            "sub_status": None,
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
            "sub_status": None,
            "updated_at": utc_now().isoformat(),
        }
        cancelled = Trip.model_validate(record)
        self.store.replace("trips", trip_id, cancelled.model_dump(mode="json"))
        return cancelled

    def _validate_approved_trip_reschedule(self, trip: Trip) -> None:
        if not trip.aircraft_id or not trip.pilot_ids:
            raise HTTPException(status_code=409, detail="Approved trip is missing an aircraft or crew assignment")
        aircraft = self.get("aircraft", trip.aircraft_id, Aircraft)
        if aircraft.status != AircraftStatus.AVAILABLE:
            raise HTTPException(status_code=409, detail="Aircraft is not available")
        if aircraft.passenger_capacity < trip.passengers:
            raise HTTPException(status_code=409, detail="Aircraft passenger capacity is too small")
        for pilot_id in trip.pilot_ids:
            pilot = self.get("pilots", pilot_id, Pilot)
            if not pilot.active:
                raise HTTPException(status_code=409, detail=f"Pilot {pilot_id} is inactive")
            if pilot.medical_expires and pilot.medical_expires < trip.departure_at.date():
                raise HTTPException(status_code=409, detail=f"Pilot {pilot_id} medical certificate is expired")
        for other in self.list("trips", Trip):
            if other.id == trip.id or other.status != TripStatus.APPROVED:
                continue
            if not self.overlaps(trip.departure_at, self._trip_end(trip), other.departure_at, self._trip_end(other)):
                continue
            if other.aircraft_id == trip.aircraft_id:
                raise HTTPException(status_code=409, detail="Aircraft has a conflicting approved trip")
            if set(other.pilot_ids) & set(trip.pilot_ids):
                raise HTTPException(status_code=409, detail="A pilot has a conflicting approved trip")

    def _ensure_no_pending_reschedule(self, target_type: RescheduleTarget, target_id: str) -> None:
        target_field = "trip_id" if target_type == RescheduleTarget.TRIP else "flight_id"
        if any(
            item.get("status") == RescheduleStatus.PENDING and item.get(target_field) == target_id
            for item in self.store.all("reschedule_requests")
        ):
            raise HTTPException(status_code=409, detail=f"A pending reschedule request already exists for this {target_type}")

    def _create_reschedule_request(
        self,
        target_type: RescheduleTarget,
        trip_id: str | None,
        flight_id: str | None,
        payload: TripRescheduleRequestCreate | FlightRescheduleRequestCreate,
        original: Trip | Flight,
    ) -> RescheduleRequest:
        target_id = trip_id if target_type == RescheduleTarget.TRIP else flight_id
        if not target_id:
            raise HTTPException(status_code=422, detail="Reschedule target is required")
        self._ensure_no_pending_reschedule(target_type, target_id)
        requested_changes = payload.requested_changes.model_dump(mode="json", exclude_unset=True)
        original_record = original.model_dump(mode="json")
        original_values = {field: original_record.get(field) for field in requested_changes}
        actual_changes = [
            RescheduleChange(field=field, before=original_values[field], after=value)
            for field, value in requested_changes.items()
            if original_values[field] != value
        ]
        if not actual_changes:
            raise HTTPException(status_code=422, detail="Requested schedule matches the current schedule")
        requested_changes = {change.field: change.after for change in actual_changes}
        original_values = {change.field: change.before for change in actual_changes}
        now = utc_now()
        event = RescheduleEvent(
            id=str(uuid4()),
            event_type="requested",
            actor=payload.requested_by,
            note=payload.reason,
            changes=actual_changes,
            created_at=now,
        )
        request = RescheduleRequest(
            id=str(uuid4()),
            target_type=target_type,
            trip_id=trip_id,
            flight_id=flight_id,
            requested_by=payload.requested_by,
            requester_contact=payload.requester_contact,
            reason=payload.reason,
            original_values=original_values,
            requested_changes=requested_changes,
            history=[event],
            created_at=now,
            updated_at=now,
        )
        collection = "trips" if target_type == RescheduleTarget.TRIP else "flights"
        target_record = original.model_dump(mode="json") | {
            "sub_status": WorkflowSubStatus.PENDING_RESCHEDULE,
            "updated_at": now.isoformat(),
        }
        self.store.create("reschedule_requests", request.model_dump(mode="json"))
        self.store.replace(collection, target_id, target_record)
        return request

    def request_trip_reschedule(self, trip_id: str, payload: TripRescheduleRequestCreate) -> RescheduleRequest:
        trip = self.get("trips", trip_id, Trip)
        if trip.status in {TripStatus.REJECTED, TripStatus.CANCELLED}:
            raise HTTPException(status_code=409, detail=f"Cannot reschedule a {trip.status} trip")
        changes = payload.requested_changes.model_dump(exclude_unset=True)
        Trip.model_validate(trip.model_dump() | changes)
        return self._create_reschedule_request(RescheduleTarget.TRIP, trip.id, None, payload, trip)

    def request_flight_reschedule(self, flight_id: str, payload: FlightRescheduleRequestCreate) -> RescheduleRequest:
        flight = self.get("flights", flight_id, Flight)
        if flight.status != FlightStatus.SCHEDULED:
            raise HTTPException(status_code=409, detail="Only scheduled flights can be rescheduled")
        changes = payload.requested_changes.model_dump(exclude_unset=True)
        Flight.model_validate(flight.model_dump() | changes)
        return self._create_reschedule_request(RescheduleTarget.FLIGHT, flight.trip_id, flight.id, payload, flight)

    def resolve_reschedule_request(self, request_id: str, resolution: RescheduleResolution) -> RescheduleRequest:
        request = self.get("reschedule_requests", request_id, RescheduleRequest)
        if request.status != RescheduleStatus.PENDING:
            raise HTTPException(status_code=409, detail="Reschedule request has already been resolved")
        collection = "trips" if request.target_type == RescheduleTarget.TRIP else "flights"
        model = Trip if request.target_type == RescheduleTarget.TRIP else Flight
        target_id = request.trip_id if request.target_type == RescheduleTarget.TRIP else request.flight_id
        if not target_id:
            raise HTTPException(status_code=409, detail="Reschedule request target is missing")
        target = self.get(collection, target_id, model)
        target_record = target.model_dump(mode="json")
        stale_fields = [field for field, value in request.original_values.items() if target_record.get(field) != value]
        if stale_fields:
            fields = ", ".join(stale_fields)
            raise HTTPException(status_code=409, detail=f"Schedule changed after this request was created: {fields}")

        now = utc_now()
        event_changes = [RescheduleChange(field="status", before=request.status, after=resolution.status)]
        if resolution.status == RescheduleStatus.APPROVED:
            if request.target_type == RescheduleTarget.TRIP:
                candidate = Trip.model_validate(target.model_dump() | request.requested_changes)
                self.validate_trip(candidate)
                if candidate.status == TripStatus.APPROVED:
                    self._validate_approved_trip_reschedule(candidate)
            else:
                if target.status != FlightStatus.SCHEDULED:
                    raise HTTPException(status_code=409, detail="Only scheduled flights can be rescheduled")
                candidate = self._flight_with_estimates(target.model_dump(mode="json") | request.requested_changes)
                self.validate_flight(candidate, exclude_id=target.id)
            for field, after in request.requested_changes.items():
                before = target_record.get(field)
                if before != after:
                    event_changes.append(RescheduleChange(field=field, before=before, after=after))
            if request.target_type == RescheduleTarget.FLIGHT:
                for field in (
                    "distance_nm",
                    "estimated_flight_time_minutes",
                    "estimated_leg_time_minutes",
                    "estimated_fuel_usage_gallons",
                ):
                    after = getattr(candidate, field)
                    if target_record.get(field) != after:
                        event_changes.append(RescheduleChange(field=field, before=target_record.get(field), after=after))
            updated_target = candidate.model_dump(mode="json") | {
                "sub_status": None,
                "updated_at": now.isoformat(),
            }
        else:
            updated_target = target_record | {"sub_status": None, "updated_at": now.isoformat()}

        event = RescheduleEvent(
            id=str(uuid4()),
            event_type="applied" if resolution.status == RescheduleStatus.APPROVED else "declined",
            actor=resolution.resolved_by,
            note=resolution.note,
            changes=event_changes,
            created_at=now,
        )
        resolved = request.model_copy(update={
            "status": resolution.status,
            "history": [*request.history, event],
            "updated_at": now,
            "resolved_at": now,
        })
        self.store.replace(collection, target_id, updated_target)
        self.store.replace("reschedule_requests", request.id, resolved.model_dump(mode="json"))
        return resolved

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

    def _flight_with_estimates(self, record: dict[str, Any]) -> Flight:
        distance_nm = None
        if self.airports:
            try:
                distance_nm = self.airports.distance(record["origin"], record["destination"]).distance_nm
            except HTTPException:
                pass
        aircraft = self.get("aircraft", record["aircraft_id"], Aircraft)
        flight_minutes = None
        leg_minutes = None
        fuel_gallons = None
        if distance_nm and aircraft.cruise_speed_kts and aircraft.fuel_burn_gph:
            flight_hours = distance_nm / aircraft.cruise_speed_kts
            flight_minutes = round(flight_hours * 60, 2)
            leg_minutes = round(flight_minutes + self.FLIGHT_GROUND_ALLOWANCE_MINUTES, 2)
            fuel_gallons = round(flight_hours * aircraft.fuel_burn_gph, 2)
        return Flight.model_validate(
            record
            | {
                "distance_nm": distance_nm,
                "estimated_flight_time_minutes": flight_minutes,
                "estimated_leg_time_minutes": leg_minutes,
                "estimated_fuel_usage_gallons": fuel_gallons,
            }
        )

    def create_flight(self, payload: FlightCreate) -> Flight:
        self.ensure_unique("flights", "flight_number", payload.flight_number)
        self.validate_flight(payload)
        now = utc_now()
        record = payload.model_dump(mode="json") | {
            "id": str(uuid4()),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        created = self._flight_with_estimates(record)
        self.store.create("flights", created.model_dump(mode="json"))
        return created

    def update_flight(self, flight_id: str, payload: BaseModel) -> Flight:
        existing = self.get("flights", flight_id, Flight)
        if existing.status != FlightStatus.SCHEDULED:
            raise HTTPException(status_code=409, detail="Only scheduled flights can be edited")
        flight_number = getattr(payload, "flight_number", None)
        if flight_number is not None:
            self.ensure_unique("flights", "flight_number", flight_number, flight_id)
        record = existing.model_dump(mode="json") | payload.model_dump(mode="json", exclude_unset=True)
        updated = self._flight_with_estimates(record | {"updated_at": utc_now().isoformat()})
        self.validate_flight(updated, exclude_id=flight_id)
        self.store.replace("flights", flight_id, updated.model_dump(mode="json"))
        return updated

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
