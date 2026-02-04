"""Tests for feasible group generation."""

from groupthere_solver.models import Tripper
from groupthere_solver.group_generator import (
    generate_feasible_groups,
    calculate_party_drive_time,
)


def test_calculate_party_drive_time_no_passengers():
    """Test drive time calculation with no passengers."""
    driver = Tripper(
        user_id="driver",
        origin_id="origin-driver",
        event_id="event-1",
        car_fits=2,
        must_drive=False,
        seconds_before_event_start_can_leave=600,
        distance_to_destination_seconds=300.0,
    )

    distance_lookup = {}
    drive_time, order = calculate_party_drive_time(driver, [], distance_lookup)

    assert drive_time == 0.0
    assert order == []


def test_calculate_party_drive_time_one_passenger():
    """Test drive time calculation with one passenger."""
    driver = Tripper(
        user_id="driver",
        origin_id="origin-driver",
        event_id="event-1",
        car_fits=2,
        must_drive=False,
        seconds_before_event_start_can_leave=600,
        distance_to_destination_seconds=300.0,
    )

    passenger = Tripper(
        user_id="passenger",
        origin_id="origin-passenger",
        event_id="event-1",
        car_fits=0,
        must_drive=False,
        seconds_before_event_start_can_leave=600,
        distance_to_destination_seconds=300.0,
    )

    distance_lookup = {
        ("driver", "passenger"): 120.0,
    }

    drive_time, order = calculate_party_drive_time(driver, [passenger], distance_lookup)

    assert drive_time == 120.0
    assert order == [passenger]


def test_calculate_party_drive_time_two_passengers():
    """Test drive time calculation with multiple passengers."""
    driver = Tripper(
        user_id="driver",
        origin_id="origin-driver",
        event_id="event-1",
        car_fits=3,
        must_drive=False,
        seconds_before_event_start_can_leave=600,
        distance_to_destination_seconds=300.0,
    )

    p1 = Tripper(
        user_id="p1",
        origin_id="origin-p1",
        event_id="event-1",
        car_fits=0,
        must_drive=False,
        seconds_before_event_start_can_leave=600,
        distance_to_destination_seconds=300.0,
    )

    p2 = Tripper(
        user_id="p2",
        origin_id="origin-p2",
        event_id="event-1",
        car_fits=0,
        must_drive=False,
        seconds_before_event_start_can_leave=600,
        distance_to_destination_seconds=300.0,
    )

    # Driver -> P1 -> P2 is 150 seconds
    # Driver -> P2 -> P1 is 200 seconds
    distance_lookup = {
        ("driver", "p1"): 100.0,
        ("driver", "p2"): 150.0,
        ("p1", "p2"): 50.0,
        ("p2", "p1"): 50.0,
    }

    drive_time, order = calculate_party_drive_time(driver, [p1, p2], distance_lookup)

    assert drive_time == 150.0  # Driver -> P1 -> P2
    assert order == [p1, p2]


def test_generate_feasible_groups_no_drivers():
    """Test group generation with no drivers."""
    trippers = [
        Tripper(
            user_id="user-1",
            origin_id="origin-1",
            event_id="event-1",
            car_fits=0,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        )
    ]

    groups = generate_feasible_groups(trippers, {})

    assert len(groups) == 0


def test_generate_feasible_groups_single_driver():
    """Test group generation with single driver alone."""
    trippers = [
        Tripper(
            user_id="user-1",
            origin_id="origin-1",
            event_id="event-1",
            car_fits=2,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        )
    ]

    groups = generate_feasible_groups(trippers, {})

    assert len(groups) == 1
    assert groups[0].driver_index == 0
    assert groups[0].passenger_indices == []
    assert groups[0].drive_time == 0.0


def test_generate_feasible_groups_driver_and_rider():
    """Test group generation with driver and rider."""
    trippers = [
        Tripper(
            user_id="driver",
            origin_id="origin-driver",
            event_id="event-1",
            car_fits=2,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
        Tripper(
            user_id="rider",
            origin_id="origin-rider",
            event_id="event-1",
            car_fits=0,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
    ]

    distance_lookup = {
        ("driver", "rider"): 120.0,
        ("rider", "driver"): 120.0,
    }

    groups = generate_feasible_groups(trippers, distance_lookup)

    # Should have: driver alone, rider alone (invalid), driver+rider
    # Only driver alone and driver+rider are valid
    assert len(groups) == 2

    # Find the group with both
    combined_group = [g for g in groups if len(g.tripper_indices) == 2]
    assert len(combined_group) == 1
    assert combined_group[0].driver_index == 0
    assert combined_group[0].passenger_indices == [1]


def test_generate_feasible_groups_must_drive_constraint():
    """Test that must_drive constraint is respected."""
    trippers = [
        Tripper(
            user_id="must-driver",
            origin_id="origin-1",
            event_id="event-1",
            car_fits=2,
            must_drive=True,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
        Tripper(
            user_id="optional-driver",
            origin_id="origin-2",
            event_id="event-1",
            car_fits=2,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
    ]

    distance_lookup = {
        ("must-driver", "optional-driver"): 100.0,
        ("optional-driver", "must-driver"): 100.0,
    }

    groups = generate_feasible_groups(trippers, distance_lookup)

    # Find the group with both people
    combined_groups = [g for g in groups if len(g.tripper_indices) == 2]

    # Should only have one combined group where must-driver is driving
    assert len(combined_groups) == 1
    assert combined_groups[0].driver_index == 0  # must-driver


def test_generate_feasible_groups_capacity_constraint():
    """Test that capacity constraints are respected."""
    trippers = [
        Tripper(
            user_id="small-car",
            origin_id="origin-1",
            event_id="event-1",
            car_fits=1,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
        Tripper(
            user_id="rider-1",
            origin_id="origin-2",
            event_id="event-1",
            car_fits=0,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
        Tripper(
            user_id="rider-2",
            origin_id="origin-3",
            event_id="event-1",
            car_fits=0,
            must_drive=False,
            seconds_before_event_start_can_leave=600,
            distance_to_destination_seconds=300.0,
        ),
    ]

    distance_lookup = {
        ("small-car", "rider-1"): 100.0,
        ("small-car", "rider-2"): 100.0,
        ("rider-1", "rider-2"): 50.0,
        ("rider-2", "rider-1"): 50.0,
        ("rider-1", "small-car"): 100.0,
        ("rider-2", "small-car"): 100.0,
    }

    groups = generate_feasible_groups(trippers, distance_lookup)

    # Should not have a group with all 3 (car only fits 1 passenger)
    three_person_groups = [g for g in groups if len(g.tripper_indices) == 3]
    assert len(three_person_groups) == 0

    # Should have groups with driver+rider-1 or driver+rider-2
    two_person_groups = [g for g in groups if len(g.tripper_indices) == 2]
    assert len(two_person_groups) == 2
