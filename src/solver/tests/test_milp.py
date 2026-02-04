"""Tests for MILP solver."""

from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.milp import solve_assignment


def test_solve_assignment_empty_groups():
    """Test that empty groups list returns infeasible solution."""
    solution = solve_assignment(num_trippers=2, feasible_groups=[])

    assert not solution.feasible
    assert not solution.optimal
    assert len(solution.selected_groups) == 0
    assert solution.total_drive_time == 0.0


def test_solve_assignment_single_group():
    """Test assignment with single feasible group."""
    group = FeasibleGroup(
        tripper_indices=[0],
        driver_index=0,
        passenger_indices=[],
        drive_time=0.0,
    )

    solution = solve_assignment(num_trippers=1, feasible_groups=[group])

    assert solution.feasible
    assert solution.optimal
    assert len(solution.selected_groups) == 1
    assert solution.selected_groups[0] == group
    assert solution.total_drive_time == 0.0


def test_solve_assignment_choose_cheaper():
    """Test that solver chooses the cheaper option."""
    # Two groups for one person: alone (cost 0) or with someone else (cost 100)
    group1 = FeasibleGroup(
        tripper_indices=[0],
        driver_index=0,
        passenger_indices=[],
        drive_time=0.0,
    )

    group2 = FeasibleGroup(
        tripper_indices=[0, 1],
        driver_index=0,
        passenger_indices=[1],
        drive_time=100.0,
    )

    group3 = FeasibleGroup(
        tripper_indices=[1],
        driver_index=1,
        passenger_indices=[],
        drive_time=0.0,
    )

    # Optimal solution: both drive alone (total 0)
    solution = solve_assignment(
        num_trippers=2, feasible_groups=[group1, group2, group3]
    )

    assert solution.feasible
    assert solution.optimal
    assert len(solution.selected_groups) == 2
    assert solution.total_drive_time == 0.0


def test_solve_assignment_forced_expensive():
    """Test assignment when cheaper option isn't available."""
    # Person 0 can drive alone (0 cost) or with person 1 (100 cost)
    # Person 1 CANNOT drive alone - must ride with 0
    group1 = FeasibleGroup(
        tripper_indices=[0, 1],
        driver_index=0,
        passenger_indices=[1],
        drive_time=100.0,
    )

    # Only one feasible solution
    solution = solve_assignment(num_trippers=2, feasible_groups=[group1])

    assert solution.feasible
    assert solution.optimal
    assert len(solution.selected_groups) == 1
    assert solution.total_drive_time == 100.0


def test_solve_assignment_three_way_choice():
    """Test solver with multiple options."""
    # 3 people, 2 drivers
    # Option A: Driver 0 alone, Driver 1 takes person 2 (cost 50)
    # Option B: Driver 0 takes person 2, Driver 1 alone (cost 30)
    # Option C: Driver 0 takes both (cost 80)
    # Option D: Driver 1 takes both (cost 90)

    groups = [
        # Option A groups
        FeasibleGroup([0], 0, [], 0.0),
        FeasibleGroup([1, 2], 1, [2], 50.0),
        # Option B groups
        FeasibleGroup([0, 2], 0, [2], 30.0),
        FeasibleGroup([1], 1, [], 0.0),
        # Option C group
        FeasibleGroup([0, 1, 2], 0, [1, 2], 80.0),
        # Option D group
        FeasibleGroup([0, 1, 2], 1, [0, 2], 90.0),
    ]

    solution = solve_assignment(num_trippers=3, feasible_groups=groups)

    assert solution.feasible
    assert solution.optimal
    # Should choose Option B (total cost 30)
    assert solution.total_drive_time == 30.0
    assert len(solution.selected_groups) == 2


def test_solve_assignment_infeasible():
    """Test that truly infeasible problems are detected."""
    # Two people but only group with person 0
    group = FeasibleGroup(
        tripper_indices=[0],
        driver_index=0,
        passenger_indices=[],
        drive_time=0.0,
    )

    solution = solve_assignment(num_trippers=2, feasible_groups=[group])

    assert not solution.feasible
    assert not solution.optimal
    assert len(solution.selected_groups) == 0
