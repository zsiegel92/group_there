"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import {
  useDistanceStatus,
  useTriggerDistanceCalculation,
} from "../../api/events/client";

export function DistanceStatus({
  eventId,
  isAdmin,
}: {
  eventId: string;
  isAdmin: boolean;
}) {
  const { data, isLoading } = useDistanceStatus(eventId);
  const trigger = useTriggerDistanceCalculation();

  if (isLoading || !data) return null;

  // No distances needed (fewer than 2 locations with coordinates)
  if (data.need === 0) return null;

  if (data.complete) {
    return (
      <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
        <div className="text-green-700 text-sm font-medium">
          All pairwise distances computed ({data.have}/{data.need})
        </div>
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
      <div className="flex items-center gap-2 text-yellow-700 text-sm font-medium">
        <Spinner className="size-3.5" />
        <span>
          Computing distances... ({data.have}/{data.need})
        </span>
      </div>
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate(eventId)}
        >
          {trigger.isPending
            ? "Triggered..."
            : "Re-attempt distance calculation"}
        </Button>
      )}
    </div>
  );
}
