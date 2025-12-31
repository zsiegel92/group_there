from pydantic import BaseModel, Field
import datetime


class LatLon(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class Location(BaseModel):
    id: str
    name: str
    address_string: str
    street1: str | None = None
    street2: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    latlon: LatLon | None = None


class User(BaseModel):
    id: str
    email: str
    name: str
    home_address: Location


class Event(BaseModel):
    id: str
    name: str
    start_time: datetime.datetime
    location: Location


class Tripper(BaseModel):
    id: str
    user_id: str
    origin_id: str
    event_id: str
    car_fits: int = Field(
        ...,
        ge=0,
        le=5,
    )
    seconds_before_event_start_can_leave: int = Field(
        ...,
        ge=0,
    )


class Problem(BaseModel):
    event_id: str
    trippers: list[Tripper]
    tripper_origin_distances_seconds: dict[tuple[str, str], float] = Field(
        ...,
        description="Tuples of tripper_ids mapped to the distance in seconds between the tripper's origins",
    )


class Party(BaseModel):
    id: str
    driver_tripper_id: str | None = None
    passenger_tripper_ids: list[str]


class Solution(BaseModel):
    id: str
    parties: list[Party]
    total_drive_seconds: float
