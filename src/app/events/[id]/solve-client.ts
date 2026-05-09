"use client";

import {
  solveProblem,
  type SolveMode,
  type SolveProblemResult,
} from "./solve-action";

export async function solveProblemWithProgress({
  eventId,
  includeHeuristic,
  onResult,
}: {
  eventId: string;
  includeHeuristic: boolean;
  onResult: (result: SolveProblemResult, mode: SolveMode) => void;
}) {
  let exactArrived = false;
  let sawSuccess = false;
  let heuristicError: unknown = null;
  let exactError: unknown = null;

  const requests: Promise<void>[] = [];

  if (includeHeuristic) {
    requests.push(
      solveProblem(eventId, "heuristic")
        .then((result) => {
          if (!exactArrived) {
            sawSuccess = true;
            onResult(result, "heuristic");
          }
        })
        .catch((error: unknown) => {
          heuristicError = error;
        })
    );
  }

  requests.push(
    solveProblem(eventId, "exact")
      .then((result) => {
        exactArrived = true;
        sawSuccess = true;
        onResult(result, "exact");
      })
      .catch((error: unknown) => {
        exactError = error;
      })
  );

  await Promise.all(requests);

  if (!sawSuccess) {
    const error = exactError ?? heuristicError;
    if (error instanceof Error) throw error;
    throw new Error("Failed to generate solution. Please try again.");
  }
}
