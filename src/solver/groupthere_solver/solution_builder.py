from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.models import Party, Tripper


def build_parties(
    trippers: list[Tripper],
    selected_groups: list[FeasibleGroup],
) -> list[Party]:
    parties: list[Party] = []
    for index, group in enumerate(selected_groups):
        if group.vehicle_kind == "external_rideshare":
            first_stop_index = (
                group.passenger_indices[0] if group.passenger_indices else None
            )
            parties.append(
                Party(
                    id=f"party-{index + 1}",
                    vehicle_kind="external_rideshare",
                    driver_tripper_id=None,
                    external_rideshare_origin_id=(
                        trippers[first_stop_index].origin_id
                        if first_stop_index is not None
                        else None
                    ),
                    cost_multiplier=group.cost_multiplier,
                    passenger_tripper_ids=[
                        trippers[passenger_index].user_id
                        for passenger_index in group.passenger_indices
                    ],
                )
            )
            continue

        if group.driver_index is None:
            raise ValueError("Participant vehicle group is missing a driver")

        parties.append(
            Party(
                id=f"party-{index + 1}",
                vehicle_kind="participant_vehicle",
                driver_tripper_id=trippers[group.driver_index].user_id,
                passenger_tripper_ids=[
                    trippers[passenger_index].user_id
                    for passenger_index in group.passenger_indices
                ],
            )
        )

    return parties


def build_participant_vehicle_parties(
    trippers: list[Tripper],
    selected_groups: list[FeasibleGroup],
) -> list[Party]:
    return build_parties(trippers, selected_groups)
