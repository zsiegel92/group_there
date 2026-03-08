import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Solution } from "@/python-client";

import { solveProblem } from "./solve-action";

interface SolveProblemProps {
  eventId: string;
}

export function SolveProblem({ eventId }: SolveProblemProps) {
  const [solution, setSolution] = useState<Solution | null>(null);
  const [isSolving, setIsSolving] = useState(false);

  const handleSolveProblem = async () => {
    setIsSolving(true);
    setSolution(null);
    try {
      const result = await solveProblem(eventId);
      setSolution(result.solution);
    } catch (error) {
      console.error("Failed to solve problem:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to generate solution. Please try again."
      );
    } finally {
      setIsSolving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Solutions</h2>
      <div className="space-y-4">
        <Button
          onClick={handleSolveProblem}
          disabled={isSolving}
          size="default"
        >
          {isSolving ? "Generating Solution..." : "Generate Solution"}
        </Button>
        {isSolving && (
          <div className="flex items-center gap-2 text-gray-600">
            <Spinner />
            <span>Solving the problem...</span>
          </div>
        )}
        {solution && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h3 className="font-medium mb-2">Solution:</h3>
            <pre className="text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(solution, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
