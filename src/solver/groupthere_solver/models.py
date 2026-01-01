from pydantic import BaseModel, Field, model_validator
import datetime
from typing import Self


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
    user_id: str
    origin_id: str
    event_id: str
    car_fits: int = Field(
        ...,
        ge=0,
        le=5,
    )
    must_drive: bool
    seconds_before_event_start_can_leave: int = Field(
        ...,
        ge=0,
    )
    distance_to_destination_seconds: float = Field(
        ...,
        ge=0,
    )


class TripperDistance(BaseModel):
    origin_user_id: str
    destination_user_id: str
    distance_seconds: float


class Problem(BaseModel):
    id: str
    event_id: str
    trippers: list[Tripper]
    tripper_distances: list[TripperDistance] = Field(
        ...,
        description="Tuples of tripper_ids mapped to the distance in seconds between the tripper's origins",
    )

    @model_validator(mode="after")
    def check_whether_all_trippers_have_a_unique_user_id(self) -> Self:
        tripper_user_ids = set(tripper.user_id for tripper in self.trippers)
        if len(tripper_user_ids) != len(self.trippers):
            raise ValueError("All trippers must have a unique user_id")
        return self

    @model_validator(mode="after")
    def check_whether_tripper_distances_use_correct_user_ids(self) -> Self:
        tripper_user_ids = set(tripper.user_id for tripper in self.trippers)
        for distance in self.tripper_distances:
            if distance.origin_user_id not in tripper_user_ids:
                raise ValueError(
                    f"User {distance.origin_user_id} is not a valid tripper"
                )
            if distance.destination_user_id not in tripper_user_ids:
                raise ValueError(
                    f"User {distance.destination_user_id} is not a valid tripper"
                )
        return self

    @model_validator(mode="after")
    def check_whether_all_tripper_pairs_have_a_distance(self) -> Self:
        tripper_pairs = set(
            (distance.origin_user_id, distance.destination_user_id)
            for distance in self.tripper_distances
        )
        for tripper_1 in self.trippers:
            for tripper_2 in self.trippers:
                if tripper_1.user_id == tripper_2.user_id:
                    continue
                if (tripper_1.user_id, tripper_2.user_id) not in tripper_pairs:
                    raise ValueError(
                        f"Tripper pair {tripper_1.user_id} and {tripper_2.user_id} has no distance"
                    )
        return self


class ProblemReceivedResponse(BaseModel):
    problem_id: str
    successfully_received: bool


class Party(BaseModel):
    id: str
    driver_tripper_id: str | None = None
    passenger_tripper_ids: list[str]


class Solution(BaseModel):
    id: str
    parties: list[Party]
    total_drive_seconds: float
