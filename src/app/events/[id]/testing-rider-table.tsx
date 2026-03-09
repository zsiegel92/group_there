"use client";

import { useCallback, useRef } from "react";

import { drivingStatusEnumValues, type DrivingStatus } from "@/db/schema";

import {
  useDeleteRider,
  useUpdateRiders,
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
}: {
  riders: TestRider[];
  eventId: string;
  eventTime: string;
}) {
  const updateRiders = useUpdateRiders();
  const deleteRider = useDeleteRider();
  const pendingUpdates = useRef(new Map<string, Record<string, unknown>>());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushUpdates = useCallback(() => {
    const updates = Array.from(pendingUpdates.current.entries()).map(
      ([userId, fields]) => ({
        userId,
        ...fields,
      })
    );
    if (updates.length > 0) {
      updateRiders.mutate({ eventId, updates });
      pendingUpdates.current.clear();
    }
  }, [eventId, updateRiders]);

  const scheduleUpdate = useCallback(
    (userId: string, fields: Record<string, unknown>) => {
      const existing = pendingUpdates.current.get(userId) ?? {};
      pendingUpdates.current.set(userId, { ...existing, ...fields });
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(flushUpdates, 500);
    },
    [flushUpdates]
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
}: {
  rider: TestRider;
  eventId: string;
  eventTime: string;
  onUpdate: (userId: string, fields: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const eventDate = new Date(eventTime);

  const currentOffset = rider.earliestLeaveTime
    ? Math.round(
        (eventDate.getTime() - new Date(rider.earliestLeaveTime).getTime()) /
          60000
      )
    : null;

  return (
    <div className="p-3 border rounded-lg bg-white text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{rider.userName}</div>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 text-xs shrink-0 cursor-pointer"
        >
          Delete
        </button>
      </div>

      <div className="text-gray-500 text-xs truncate">
        {rider.originLocation?.name ?? "No origin"}
      </div>

      {/* Driving status chips */}
      <div className="flex flex-wrap gap-1">
        {drivingStatusEnumValues.map((status) => (
          <button
            key={status}
            onClick={() => {
              onUpdate(rider.userId, {
                drivingStatus: status,
                ...(status === "cannot_drive" ? { carFits: 0 } : {}),
              });
            }}
            className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
              rider.drivingStatus === status
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          <span className="text-xs w-4 text-center">{rider.carFits}</span>
          <button
            onClick={() =>
              onUpdate(rider.userId, { carFits: rider.carFits + 1 })
            }
            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-xs cursor-pointer"
          >
            +
          </button>
        </div>
      )}

      {/* Departure time chips */}
      {rider.drivingStatus !== "cannot_drive" && (
        <div className="flex flex-wrap gap-1">
          <span className="text-gray-500 text-xs mr-1 self-center">Leave:</span>
          {DEPARTURE_OFFSETS.map((mins) => (
            <button
              key={mins}
              onClick={() => {
                const leaveTime = new Date(
                  eventDate.getTime() - mins * 60 * 1000
                );
                onUpdate(rider.userId, {
                  earliestLeaveTime: leaveTime.toISOString(),
                });
              }}
              className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                currentOffset === mins
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
