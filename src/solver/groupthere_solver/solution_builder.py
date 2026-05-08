from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.models import Party, Tripper


def build_participant_vehicle_parties(
    trippers: list[Tripper],
    selected_groups: list[FeasibleGroup],
) -> list[Party]:
    return [
        Party(
            id=f"party-{index + 1}",
            vehicle_kind="participant_vehicle",
            driver_tripper_id=trippers[group.driver_index].user_id,
            passenger_tripper_ids=[
                trippers[passenger_index].user_id
                for passenger_index in group.passenger_indices
            ],
        )
        for index, group in enumerate(selected_groups)
    ]
