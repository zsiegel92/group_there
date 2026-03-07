from groupthere_solver.models import Problem, Solution, Tripper, Party, TripperDistance

tripper_a = Tripper(
	user_id="user-a",
	origin_id="origin-a",
	event_id="event-1",
	car_fits=2,
	must_drive=True,
	seconds_before_event_start_can_leave=60,
	distance_to_destination_seconds=5.0,
)

tripper_b = Tripper(
	user_id="user-b",
	origin_id="origin-b",
	event_id="event-1",
	car_fits=0,  # No car
	must_drive=False,
	seconds_before_event_start_can_leave=60,
	distance_to_destination_seconds=5.0,
)

mock_problem = Problem(
	id="test-problem-1",
	event_id="event-1",
	trippers=[tripper_a, tripper_b],
	tripper_distances=[
		TripperDistance(
			origin_user_id="user-a",
			destination_user_id="user-b",
			distance_seconds=5.0,
		),
		TripperDistance(
			origin_user_id="user-b",
			destination_user_id="user-a",
			distance_seconds=5.0,
		),
	],
)

# Expected solution: one party with A driving and B as passenger
mock_problem_expected_solution = Solution(
	id="expected",
	successfully_completed=True,
	feasible=True,
	optimal=False,
	parties=[
		Party(
			id="party-1",
			driver_tripper_id="user-a",
			passenger_tripper_ids=["user-b"],
		)
	],
	total_drive_seconds=5.0,
)
