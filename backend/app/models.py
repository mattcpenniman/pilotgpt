from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AircraftStatus(StrEnum):
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"
    OUT_OF_SERVICE = "out_of_service"


class TripStatus(StrEnum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class FlightStatus(StrEnum):
    SCHEDULED = "scheduled"
    DEPARTED = "departed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RescheduleTarget(StrEnum):
    TRIP = "trip"
    FLIGHT = "flight"


class RescheduleStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


class WorkflowSubStatus(StrEnum):
    PENDING_RESCHEDULE = "pending_reschedule"


class PilotCreate(ApiModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    license_number: str = Field(min_length=1, max_length=50)
    certifications: list[str] = Field(default_factory=list)
    medical_expires: date | None = None
    active: bool = True


class PilotUpdate(ApiModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    license_number: str | None = Field(default=None, min_length=1, max_length=50)
    certifications: list[str] | None = None
    medical_expires: date | None = None
    active: bool | None = None


class Pilot(PilotCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class AircraftCreate(ApiModel):
    tail_number: str = Field(min_length=2, max_length=12)
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1903, le=2100)
    passenger_capacity: int = Field(ge=1, le=1000)
    home_airport: str = Field(min_length=3, max_length=4)
    status: AircraftStatus = AircraftStatus.AVAILABLE
    total_hours: float = Field(default=0, ge=0)

    @field_validator("tail_number", "home_airport")
    @classmethod
    def uppercase_codes(cls, value: str) -> str:
        return value.upper()


class AircraftUpdate(ApiModel):
    tail_number: str | None = Field(default=None, min_length=2, max_length=12)
    make: str | None = Field(default=None, min_length=1, max_length=80)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    year: int | None = Field(default=None, ge=1903, le=2100)
    passenger_capacity: int | None = Field(default=None, ge=1, le=1000)
    home_airport: str | None = Field(default=None, min_length=3, max_length=4)
    status: AircraftStatus | None = None
    total_hours: float | None = Field(default=None, ge=0)

    @field_validator("tail_number", "home_airport")
    @classmethod
    def uppercase_codes(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class Aircraft(AircraftCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class TripCreate(ApiModel):
    customer_name: str = Field(min_length=1, max_length=120)
    customer_email: EmailStr | None = None
    customer_phone: str | None = Field(default=None, max_length=30)
    origin: str = Field(min_length=3, max_length=4)
    destination: str = Field(min_length=3, max_length=4)
    departure_at: datetime
    return_at: datetime | None = None
    passengers: int = Field(ge=1, le=1000)
    purpose: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("origin", "destination")
    @classmethod
    def uppercase_airports(cls, value: str) -> str:
        return value.upper()

    @field_validator("departure_at", "return_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value

    @model_validator(mode="after")
    def return_after_departure(self) -> TripCreate:
        if self.return_at and self.return_at <= self.departure_at:
            raise ValueError("return_at must be after departure_at")
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        return self


class TripUpdate(ApiModel):
    customer_name: str | None = Field(default=None, min_length=1, max_length=120)
    customer_email: EmailStr | None = None
    customer_phone: str | None = Field(default=None, max_length=30)
    origin: str | None = Field(default=None, min_length=3, max_length=4)
    destination: str | None = Field(default=None, min_length=3, max_length=4)
    departure_at: datetime | None = None
    return_at: datetime | None = None
    passengers: int | None = Field(default=None, ge=1, le=1000)
    purpose: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("origin", "destination")
    @classmethod
    def uppercase_airports(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @field_validator("departure_at", "return_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value


class Trip(TripCreate):
    id: str
    status: TripStatus = TripStatus.REQUESTED
    aircraft_id: str | None = None
    pilot_ids: list[str] = Field(default_factory=list)
    approved_by: str | None = None
    approved_at: datetime | None = None
    rejected_reason: str | None = None
    sub_status: WorkflowSubStatus | None = None
    created_at: datetime
    updated_at: datetime


class TripApproval(ApiModel):
    aircraft_id: str
    pilot_ids: list[str] = Field(min_length=1)
    approved_by: str = Field(min_length=1, max_length=120)

    @field_validator("pilot_ids")
    @classmethod
    def unique_pilots(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("pilot_ids must be unique")
        return values


class TripRejection(ApiModel):
    reason: str = Field(min_length=1, max_length=500)


class FlightCreate(ApiModel):
    trip_id: str | None = None
    flight_number: str = Field(min_length=1, max_length=30)
    aircraft_id: str
    pilot_ids: list[str] = Field(min_length=1)
    origin: str = Field(min_length=3, max_length=4)
    destination: str = Field(min_length=3, max_length=4)
    scheduled_departure: datetime
    scheduled_arrival: datetime
    passengers: int = Field(default=0, ge=0, le=1000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("origin", "destination")
    @classmethod
    def uppercase_airports(cls, value: str) -> str:
        return value.upper()

    @field_validator("scheduled_departure", "scheduled_arrival")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value

    @model_validator(mode="after")
    def validate_leg(self) -> FlightCreate:
        if self.scheduled_arrival <= self.scheduled_departure:
            raise ValueError("scheduled_arrival must be after scheduled_departure")
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        if len(self.pilot_ids) != len(set(self.pilot_ids)):
            raise ValueError("pilot_ids must be unique")
        return self


class FlightUpdate(ApiModel):
    flight_number: str | None = Field(default=None, min_length=1, max_length=30)
    aircraft_id: str | None = None
    pilot_ids: list[str] | None = Field(default=None, min_length=1)
    origin: str | None = Field(default=None, min_length=3, max_length=4)
    destination: str | None = Field(default=None, min_length=3, max_length=4)
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    passengers: int | None = Field(default=None, ge=0, le=1000)
    notes: str | None = Field(default=None, max_length=2000)


class Flight(FlightCreate):
    id: str
    status: FlightStatus = FlightStatus.SCHEDULED
    actual_departure: datetime | None = None
    actual_arrival: datetime | None = None
    sub_status: WorkflowSubStatus | None = None
    created_at: datetime
    updated_at: datetime


class FlightStatusUpdate(ApiModel):
    status: FlightStatus
    occurred_at: datetime | None = None


class TripRescheduleChanges(ApiModel):
    origin: str | None = Field(default=None, min_length=3, max_length=4)
    destination: str | None = Field(default=None, min_length=3, max_length=4)
    departure_at: datetime | None = None
    return_at: datetime | None = None

    @field_validator("origin", "destination")
    @classmethod
    def uppercase_airports(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @field_validator("departure_at", "return_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value

    @model_validator(mode="after")
    def require_change(self) -> TripRescheduleChanges:
        if not self.model_fields_set:
            raise ValueError("at least one requested change is required")
        return self


class FlightRescheduleChanges(ApiModel):
    origin: str | None = Field(default=None, min_length=3, max_length=4)
    destination: str | None = Field(default=None, min_length=3, max_length=4)
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    aircraft_id: str | None = None
    pilot_ids: list[str] | None = Field(default=None, min_length=1)

    @field_validator("origin", "destination")
    @classmethod
    def uppercase_airports(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @field_validator("scheduled_departure", "scheduled_arrival")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value

    @field_validator("pilot_ids")
    @classmethod
    def unique_pilots(cls, values: list[str] | None) -> list[str] | None:
        if values is not None and len(values) != len(set(values)):
            raise ValueError("pilot_ids must be unique")
        return values

    @model_validator(mode="after")
    def require_change(self) -> FlightRescheduleChanges:
        if not self.model_fields_set:
            raise ValueError("at least one requested change is required")
        return self


class RescheduleRequestBase(ApiModel):
    requested_by: str = Field(min_length=1, max_length=120)
    requester_contact: str | None = Field(default=None, max_length=200)
    reason: str = Field(min_length=1, max_length=1000)


class TripRescheduleRequestCreate(RescheduleRequestBase):
    requested_changes: TripRescheduleChanges


class FlightRescheduleRequestCreate(RescheduleRequestBase):
    requested_changes: FlightRescheduleChanges


class RescheduleResolution(ApiModel):
    status: RescheduleStatus
    resolved_by: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("status")
    @classmethod
    def require_final_status(cls, value: RescheduleStatus) -> RescheduleStatus:
        if value == RescheduleStatus.PENDING:
            raise ValueError("resolution status must be approved or declined")
        return value


class RescheduleChange(ApiModel):
    field: str
    before: Any = None
    after: Any = None


class RescheduleEvent(ApiModel):
    id: str
    event_type: str
    actor: str
    note: str | None = None
    changes: list[RescheduleChange] = Field(default_factory=list)
    created_at: datetime


class RescheduleRequest(ApiModel):
    id: str
    target_type: RescheduleTarget
    trip_id: str | None = None
    flight_id: str | None = None
    status: RescheduleStatus = RescheduleStatus.PENDING
    requested_by: str
    requester_contact: str | None = None
    reason: str
    original_values: dict[str, Any]
    requested_changes: dict[str, Any]
    history: list[RescheduleEvent]
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None


class FuelLogCreate(ApiModel):
    aircraft_id: str
    flight_id: str | None = None
    airport: str = Field(min_length=3, max_length=4)
    fueled_at: datetime
    gallons: Annotated[float, Field(gt=0)]
    price_per_gallon: Annotated[float, Field(ge=0)]
    vendor: str | None = Field(default=None, max_length=120)
    receipt_number: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("airport")
    @classmethod
    def uppercase_airport(cls, value: str) -> str:
        return value.upper()

    @field_validator("fueled_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value


class FuelLogUpdate(ApiModel):
    flight_id: str | None = None
    airport: str | None = Field(default=None, min_length=3, max_length=4)
    fueled_at: datetime | None = None
    gallons: float | None = Field(default=None, gt=0)
    price_per_gallon: float | None = Field(default=None, ge=0)
    vendor: str | None = Field(default=None, max_length=120)
    receipt_number: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)


class FuelLog(FuelLogCreate):
    id: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def total_cost(self) -> float:
        return round(self.gallons * self.price_per_gallon, 2)


class Dashboard(ApiModel):
    pilots: int
    active_pilots: int
    aircraft: int
    available_aircraft: int
    requested_trips: int
    approved_trips: int
    scheduled_flights: int
    fuel_gallons: float
    fuel_cost: float
