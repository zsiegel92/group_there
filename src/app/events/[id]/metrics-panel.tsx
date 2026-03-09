"use client";

import { useMemo } from "react";

import { Spinner } from "@/components/ui/spinner";
import type { Problem, Solution } from "@/python-client";

function formatMinutes(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

export function MetricsPanel({
  solveResult,
  isLoading,
}: {
  solveResult: { problem: Problem; solution: Solution } | null;
  isLoading?: boolean;
}) {
  const metrics = useMemo(() => {
    if (!solveResult) return null;
    const soloTotalDriveSeconds = solveResult.problem.trippers.reduce(
      (sum, t) => sum + t.distance_to_destination_seconds,
      0
    );
    const optimalTotalDriveSeconds = solveResult.solution.total_drive_seconds;
    const savingsSeconds = soloTotalDriveSeconds - optimalTotalDriveSeconds;
    const savingsPercent =
      soloTotalDriveSeconds > 0
        ? (savingsSeconds / soloTotalDriveSeconds) * 100
        : 0;
    return {
      soloTotalDriveSeconds,
      optimalTotalDriveSeconds,
      savingsSeconds,
      savingsPercent,
    };
  }, [solveResult]);

  if (isLoading) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Metrics</h2>
        <div className="flex items-center gap-2 text-gray-500">
          <Spinner className="size-3.5" />
          <span className="text-sm">Computing metrics...</span>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Metrics</h2>
        <p className="text-gray-500 text-sm">
          Generate a solution to see optimization metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Optimization Metrics</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Everyone Drives Solo</div>
          <div className="text-2xl font-bold text-gray-800">
            {formatMinutes(metrics.soloTotalDriveSeconds)}
          </div>
          <div className="text-xs text-gray-400">total driving time</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Optimized Carpools</div>
          <div className="text-2xl font-bold text-green-700">
            {formatMinutes(metrics.optimalTotalDriveSeconds)}
          </div>
          <div className="text-xs text-gray-400">total driving time</div>
        </div>
        <div className="bg-white p-4 rounded-lg border col-span-2">
          <div className="text-sm text-gray-500">Savings</div>
          <div className="text-2xl font-bold text-blue-700">
            {formatMinutes(metrics.savingsSeconds)}{" "}
            <span className="text-lg">
              ({metrics.savingsPercent.toFixed(1)}%)
            </span>
          </div>
          <div className="text-xs text-gray-400">
            less total driving time with carpools
          </div>
        </div>
      </div>
    </div>
  );
}
