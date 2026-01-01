import { solveSolvePost } from "@/lib/python-client";
import type { Problem, Tripper, TripperDistance } from "@/python-client";

async function main() {
  if (!process.env.GROUPTHERE_SOLVER_API_KEY) {
    throw new Error("GROUPTHERE_SOLVER_API_KEY is not set");
  }
  if (!process.env.GROUPTHERE_SOLVER_API_URL) {
    throw new Error("GROUPTHERE_SOLVER_API_URL is not set");
  }

  console.log("Testing solver service at:", process.env.GROUPTHERE_SOLVER_API_URL);
  console.log();

  // Test 1: Empty problem
  console.log("Test 1: Empty problem");
  const emptyProblem: Problem = {
    id: "test-problem-1",
    event_id: "test-event-1",
    trippers: [],
    tripper_distances: [],
  };

  const emptyResponse = await solveSolvePost({
    body: emptyProblem,
  });

  if (emptyResponse.error) {
    console.error("❌ Empty problem test failed:");
    console.error(JSON.stringify(emptyResponse.error, null, 2));
    throw new Error("Empty problem test failed");
  }

  console.log("✅ Empty problem test passed");
  console.log("Solution:", JSON.stringify(emptyResponse.data, null, 2));
  console.log();

  // Test 2: Simple driver and rider
  console.log("Test 2: Simple driver and rider");

  const tripperA: Tripper = {
    user_id: "user-a",
    origin_id: "origin-a",
    event_id: "event-1",
    car_fits: 2,
    must_drive: true,
    seconds_before_event_start_can_leave: 60,
    distance_to_destination_seconds: 5.0,
  };

  const tripperB: Tripper = {
    user_id: "user-b",
    origin_id: "origin-b",
    event_id: "event-1",
    car_fits: 0, // No car
    must_drive: false,
    seconds_before_event_start_can_leave: 60,
    distance_to_destination_seconds: 5.0,
  };

  const tripperDistances: TripperDistance[] = [
    {
      origin_user_id: "user-a",
      destination_user_id: "user-b",
      distance_seconds: 5.0,
    },
    {
      origin_user_id: "user-b",
      destination_user_id: "user-a",
      distance_seconds: 5.0,
    },
  ];

  const problem: Problem = {
    id: "test-problem-1",
    event_id: "event-1",
    trippers: [tripperA, tripperB],
    tripper_distances: tripperDistances,
  };

  const response = await solveSolvePost({
    body: problem,
  });

  if (response.error) {
    console.error("❌ Simple driver and rider test failed:");
    console.error(JSON.stringify(response.error, null, 2));
    throw new Error("Simple driver and rider test failed");
  }

  console.log("✅ Simple driver and rider test passed");
  console.log("Solution:", JSON.stringify(response.data, null, 2));
  console.log();

  console.log("All tests passed! 🎉");
}

main().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
