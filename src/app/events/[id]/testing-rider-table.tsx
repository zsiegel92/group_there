"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { drivingStatusEnumValues, type DrivingStatus } from "@/db/schema";

import {
  useDeleteRider,
  useUpdateRiders,
  type RiderFieldUpdate,
  type TestRider,
} from "../../api/testing-events/client";

const DEPARTURE_OFFSETS = [15, 30, 45, 60, 75, 90, 120];

const STATUS_LABELS: Record<DrivingStatus, string> = {
  cannot_drive: "Cannot Drive",
  must_drive: "Must Drive",
  can_drive_or_not: "Either",
};

export function TestingRiderTable({
  riders,
  eventId,
  eventTime,
  locked,
}: {
  riders: TestRider[];
  eventId: string;
  eventTime: string;
  locked: boolean;
}) {
  const queryClient = useQueryClient();
  const updateRiders = useUpdateRiders();
  const deleteRider = useDeleteRider();
  const pendingUpdates = useRef(new Map<string, RiderFieldUpdate>());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirtyUserIds, setDirtyUserIds] = useState<Set<string>>(new Set());

  const flushUpdates = useCallback(() => {
    const entries = Array.from(pendingUpdates.current.entries());
    const updates = entries.map(([userId, fields]) => ({
      userId,
      ...fields,
    }));
    const flushedIds = entries.map(([userId]) => userId);
    pendingUpdates.current.clear();

    if (updates.length > 0) {
      updateRiders.mutate(
        { eventId, updates },
        {
          onSettled: () => {
            setDirtyUserIds((prev) => {
              const next = new Set(prev);
              for (const id of flushedIds) {
                if (!pendingUpdates.current.has(id)) {
                  next.delete(id);
                }
              }
              return next;
            });
          },
        }
      );
    }
  }, [eventId, updateRiders]);

  const scheduleUpdate = useCallback(
    (userId: string, fields: RiderFieldUpdate) => {
      // Mark as dirty immediately
      setDirtyUserIds((prev) => new Set(prev).add(userId));

      // Optimistically update the cache so the UI reflects the change instantly
      const qk = ["testing-events", eventId, "riders"];
      void queryClient.cancelQueries({ queryKey: qk });
      queryClient.setQueryData<{ riders: TestRider[] }>(qk, (old) => {
        if (!old) return old;
        return {
          riders: old.riders.map((r) =>
            r.userId === userId ? { ...r, ...fields } : r
          ),
        };
      });

      // Queue for batched network request (debounced)
      const existing = pendingUpdates.current.get(userId) ?? {};
      pendingUpdates.current.set(userId, { ...existing, ...fields });
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(flushUpdates, 500);
    },
    [eventId, flushUpdates, queryClient]
  );

  if (riders.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        No riders yet. Generate some to get started.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {riders.map((rider) => (
        <RiderRow
          key={rider.userId}
          rider={rider}
          eventId={eventId}
          eventTime={eventTime}
          onUpdate={scheduleUpdate}
          onDelete={() => deleteRider.mutate({ eventId, userId: rider.userId })}
          isPending={dirtyUserIds.has(rider.userId)}
          locked={locked}
        />
      ))}
    </div>
  );
}

function RiderRow({
  rider,
  eventId: _eventId,
  eventTime,
  onUpdate,
  onDelete,
  isPending,
  locked,
}: {
  rider: TestRider;
  eventId: string;
  eventTime: string;
  onUpdate: (userId: string, fields: RiderFieldUpdate) => void;
  onDelete: () => void;
  isPending: boolean;
  locked: boolean;
}) {
  const eventDate = new Date(eventTime);

  const currentOffset = rider.earliestLeaveTime
    ? Math.round(
        (eventDate.getTime() - new Date(rider.earliestLeaveTime).getTime()) /
          60000
      )
    : null;

  return (
    <div
      className={`p-3 border rounded-lg text-sm space-y-2 transition-colors ${
        isPending ? "border-blue-300 bg-blue-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate flex items-center gap-1.5">
          {rider.userName}
          {isPending && (
            <span className="inline-block size-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        {!locked && (
          <button
            onClick={onDelete}
            className="text-red-500 hover:text-red-700 text-xs shrink-0 cursor-pointer"
          >
            Delete
          </button>
        )}
      </div>

      <div className="text-gray-500 text-xs truncate">
        {rider.originLocation?.name ?? "No origin"}
      </div>

      {/* Driving status chips */}
      <div className="flex flex-wrap gap-1">
        {drivingStatusEnumValues.map((status) => (
          <button
            key={status}
            onClick={
              locked
                ? undefined
                : () => {
                    onUpdate(rider.userId, {
                      drivingStatus: status,
                      ...(status === "cannot_drive" ? { carFits: 0 } : {}),
                    });
                  }
            }
            className={`px-2 py-0.5 rounded text-xs ${
              rider.drivingStatus === status
                ? "bg-blue-600 text-white"
                : locked
                  ? "bg-gray-100 text-gray-400"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
            }`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* Car seats */}
      {rider.drivingStatus !== "cannot_drive" && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">Seats:</span>
          {!locked && (
            <button
              onClick={() =>
                onUpdate(rider.userId, {
                  carFits: Math.max(1, rider.carFits - 1),
                })
              }
              className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-xs cursor-pointer"
            >
              -
            </button>
          )}
          <span className="text-xs w-4 text-center">{rider.carFits}</span>
          {!locked && (
            <button
              onClick={() =>
                onUpdate(rider.userId, { carFits: rider.carFits + 1 })
              }
              className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-xs cursor-pointer"
            >
              +
            </button>
          )}
        </div>
      )}

      {/* Departure time chips */}
      {rider.drivingStatus !== "cannot_drive" && (
        <div className="flex flex-wrap gap-1">
          <span className="text-gray-500 text-xs mr-1 self-center">Leave:</span>
          {DEPARTURE_OFFSETS.map((mins) => (
            <button
              key={mins}
              onClick={
                locked
                  ? undefined
                  : () => {
                      const leaveTime = new Date(
                        eventDate.getTime() - mins * 60 * 1000
                      );
                      onUpdate(rider.userId, {
                        earliestLeaveTime: leaveTime.toISOString(),
                      });
                    }
              }
              className={`px-2 py-0.5 rounded text-xs ${
                currentOffset === mins
                  ? "bg-blue-600 text-white"
                  : locked
                    ? "bg-gray-100 text-gray-400"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
              }`}
            >
              -{mins}m
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
