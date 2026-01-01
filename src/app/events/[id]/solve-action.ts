"use server";

import { solveSolvePost } from "@/lib/python-client";
import { constructProblem } from "@/lib/solver/construct-problem";

export async function solveProblem(eventId: string) {
  const problem = await constructProblem(eventId);
  const response = await solveSolvePost({
    body: problem,
  });

  if (response.error) {
    throw new Error(
      `Failed to solve problem: ${JSON.stringify(response.error)}`
    );
  }

  return response.data;
}
