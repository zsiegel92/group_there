"use client";

import { useCallback, useMemo, useState } from "react";
import { addMinutes, differenceInMinutes, format, subMinutes } from "date-fns";

import { AddressSelectorAndCard } from "@/components/address-selector-and-card";
import { useDialog } from "@/components/dialog-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type DrivingStatus, type EventKind } from "@/db/schema";
import { useSession } from "@/lib/auth-client";
import type { Location } from "@/lib/geo/schema";

import {
  useAttendEvent,
  useLeaveEvent,
  useUpdateAttendance,
} from "../../api/events/client";

type Event = {
  kind: EventKind;
  time: string;
  hasJoined: boolean;
  scheduled: boolean;
  locked: boolean;
  userAttendance: {
    drivingStatus: DrivingStatus;
    carFits: number | null;
    earliestLeaveTime: string | null;
    originLocationId: string | null;
    originLocation: Location | null;
    destinationLocationId: string | null;
    destinationLocation: Location | null;
    requiredArrivalTime: string | null;
  } | null;
  seriesAttendances?: {
    drivingStatus: DrivingStatus;
    carFits: number | null;
    earliestLeaveTime: string | null;
    originLocationId: string | null;
    originLocation: Location | null;
    destinationLocationId: string | null;
    destinationLocation: Location | null;
    requiredArrivalTime: string | null;
    eventId: string;
    eventTime: string;
  }[];
};

function formatDatetimeLocal(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function parseDrivingStatus(value: string): DrivingStatus {
  if (value === "must_drive") return "must_drive";
  if (value === "can_drive_or_not") return "can_drive_or_not";
  return "cannot_drive";
}

function drivingStatusLabel(status: DrivingStatus) {
  if (status === "must_drive") return "Must drive";
  if (status === "can_drive_or_not") return "Can drive";
  return "Cannot drive";
}

function offsetLabel(minutes: number | null) {
  if (minutes == null) return "No time offset";
  if (minutes < 60) return `${minutes} min before`;
  if (minutes % 60 === 0) return `${minutes / 60} hr before`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min before`;
}

type AttendanceFormProps = {
  event: Event;
  eventId: string;
  renderAsButton?: boolean;
  presentation?: "card" | "plain";
  title?: string | null;
  onSubmitted?: () => void;
};

export function AttendanceForm({
  event,
  eventId,
  renderAsButton = false,
  presentation = "card",
  title,
  onSubmitted,
}: AttendanceFormProps) {
  const { data: session } = useSession();
  const attendEvent = useAttendEvent();
  const updateAttendance = useUpdateAttendance();
  const leaveEvent = useLeaveEvent();
  const dialog = useDialog();

  const [isEditingAttendance, setIsEditingAttendance] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Attendance form state
  const [drivingStatus, setDrivingStatus] =
    useState<DrivingStatus>("cannot_drive");
  const [passengersCount, setPassengersCount] = useState(1);
  const [earliestLeaveTime, setEarliestLeaveTime] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null
  );
  const [selectedDestination, setSelectedDestination] =
    useState<Location | null>(null);
  const [requiredArrivalTime, setRequiredArrivalTime] = useState(
    formatDatetimeLocal(new Date(event.time))
  );

  const handleAttendanceSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!selectedLocation) {
        dialog.alert("Please select an origin location.");
        return;
      }
      if (event.kind === "commute" && !selectedDestination) {
        dialog.alert("Please select a destination.");
        return;
      }

      const attendanceData = {
        drivingStatus,
        carFits: drivingStatus !== "cannot_drive" ? passengersCount : 0,
        earliestLeaveTime:
          drivingStatus !== "cannot_drive" && earliestLeaveTime
            ? earliestLeaveTime
            : null,
        originLocationId: selectedLocation.id,
        destinationLocationId:
          event.kind === "commute" ? selectedDestination?.id : null,
        requiredArrivalTime:
          event.kind === "commute" ? requiredArrivalTime : null,
        joinedAt: new Date().toISOString(),
      };

      try {
        if (event.hasJoined) {
          await updateAttendance.mutateAsync({
            eventId,
            input: attendanceData,
          });
          setIsEditingAttendance(false);
          onSubmitted?.();
          dialog.alert("Attendance updated successfully!");
        } else {
          await attendEvent.mutateAsync({
            eventId,
            input: attendanceData,
          });
          setIsEditingAttendance(false);
          onSubmitted?.();
          dialog.alert("Joined event successfully!");
        }
      } catch (error) {
        console.error("Failed to submit attendance:", error);
        if (error instanceof Error) {
          dialog.alert(error.message);
        }
      }
    },
    [
      drivingStatus,
      passengersCount,
      earliestLeaveTime,
      selectedLocation,
      selectedDestination,
      requiredArrivalTime,
      eventId,
      event.kind,
      updateAttendance,
      attendEvent,
      event.hasJoined,
      setIsEditingAttendance,
      dialog,
      onSubmitted,
    ]
  );

  const handleLeave = useCallback(async () => {
    try {
      await leaveEvent.mutateAsync(eventId);
      setShowLeaveConfirm(false);
      setIsEditingAttendance(false);
      dialog.alert("You have left the event.");
    } catch (error) {
      console.error("Failed to leave event:", error);
      if (error instanceof Error) {
        dialog.alert(error.message);
      }
    }
  }, [eventId, leaveEvent, setIsEditingAttendance, dialog]);

  const openAttendanceForm = useCallback(() => {
    if (!event.userAttendance) return;
    setDrivingStatus(event.userAttendance.drivingStatus);
    const carFits = event.userAttendance.carFits;
    setPassengersCount(carFits != null && carFits > 0 ? carFits : 1);
    if (event.userAttendance.earliestLeaveTime) {
      setEarliestLeaveTime(
        formatDatetimeLocal(new Date(event.userAttendance.earliestLeaveTime))
      );
    }
    setSelectedLocation(event.userAttendance.originLocation);
    setSelectedDestination(event.userAttendance.destinationLocation);
    setRequiredArrivalTime(
      event.userAttendance.requiredArrivalTime
        ? formatDatetimeLocal(
            new Date(event.userAttendance.requiredArrivalTime)
          )
        : formatDatetimeLocal(new Date(event.time))
    );
    setIsEditingAttendance(true);
  }, [event.time, event.userAttendance, setIsEditingAttendance]);

  // Calculate time difference for display
  const getTimeBefore = useCallback(() => {
    if (!earliestLeaveTime) return "";
    const arrivalTime =
      event.kind === "commute" && requiredArrivalTime
        ? requiredArrivalTime
        : event.time;
    const diff = differenceInMinutes(
      new Date(arrivalTime),
      new Date(earliestLeaveTime)
    );
    return `${diff} minutes before arrival`;
  }, [earliestLeaveTime, event.kind, event.time, requiredArrivalTime]);

  const canDrive = drivingStatus !== "cannot_drive";
  const arrivalTimeForAvailability =
    event.kind === "commute" && requiredArrivalTime
      ? requiredArrivalTime
      : event.time;

  const seriesSuggestions = useMemo(() => {
    const currentTime = new Date(event.time).getTime();
    const bestByKey = new Map<
      string,
      NonNullable<Event["seriesAttendances"]>[number]
    >();

    const isBetter = (
      candidate: NonNullable<Event["seriesAttendances"]>[number],
      incumbent: NonNullable<Event["seriesAttendances"]>[number]
    ) => {
      const candidateTime = new Date(candidate.eventTime).getTime();
      const incumbentTime = new Date(incumbent.eventTime).getTime();
      const candidateFuture = candidateTime >= currentTime;
      const incumbentFuture = incumbentTime >= currentTime;
      if (candidateFuture !== incumbentFuture) return candidateFuture;
      return candidateFuture
        ? candidateTime < incumbentTime
        : candidateTime > incumbentTime;
    };

    for (const attendance of event.seriesAttendances ?? []) {
      if (!attendance.originLocationId || !attendance.originLocation) continue;
      if (
        event.kind === "commute" &&
        (!attendance.destinationLocationId || !attendance.destinationLocation)
      ) {
        continue;
      }
      const key =
        event.kind === "commute"
          ? `${attendance.originLocationId}:${attendance.destinationLocationId}`
          : attendance.originLocationId;
      const incumbent = bestByKey.get(key);
      if (!incumbent || isBetter(attendance, incumbent)) {
        bestByKey.set(key, attendance);
      }
    }

    return [...bestByKey.values()];
  }, [event.kind, event.seriesAttendances, event.time]);

  const applyOriginAttendance = useCallback(
    (attendance: NonNullable<Event["seriesAttendances"]>[number]) => {
      setSelectedLocation(attendance.originLocation);
      setDrivingStatus(attendance.drivingStatus);
      setPassengersCount(
        attendance.carFits != null && attendance.carFits > 0
          ? attendance.carFits
          : 1
      );

      if (
        attendance.drivingStatus !== "cannot_drive" &&
        attendance.earliestLeaveTime
      ) {
        const sourceArrival =
          event.kind === "commute" && attendance.requiredArrivalTime
            ? attendance.requiredArrivalTime
            : attendance.eventTime;
        const targetArrival =
          event.kind === "commute" && requiredArrivalTime
            ? requiredArrivalTime
            : event.time;
        const minutes = differenceInMinutes(
          new Date(sourceArrival),
          new Date(attendance.earliestLeaveTime)
        );
        setEarliestLeaveTime(
          formatDatetimeLocal(subMinutes(new Date(targetArrival), minutes))
        );
      } else {
        setEarliestLeaveTime("");
      }
    },
    [event.kind, event.time, requiredArrivalTime]
  );

  const applyDestinationAttendance = useCallback(
    (attendance: NonNullable<Event["seriesAttendances"]>[number]) => {
      setSelectedDestination(attendance.destinationLocation);
      if (attendance.requiredArrivalTime) {
        const minutes = differenceInMinutes(
          new Date(attendance.requiredArrivalTime),
          new Date(attendance.eventTime)
        );
        setRequiredArrivalTime(
          formatDatetimeLocal(addMinutes(new Date(event.time), minutes))
        );
      }
    },
    [event.time]
  );

  const formContent = (
    <>
      <form onSubmit={handleAttendanceSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Driving Status *
          </label>
          <select
            value={drivingStatus}
            onChange={(e) =>
              setDrivingStatus(parseDrivingStatus(e.target.value))
            }
            className="w-full p-2 border rounded"
            required
          >
            <option value="cannot_drive">Cannot Drive</option>
            <option value="must_drive">Must Drive</option>
            <option value="can_drive_or_not">Can Drive or Not Drive</option>
          </select>
        </div>

        {canDrive && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">
                Non-driver Seats Available *
              </label>
              <Input
                type="number"
                min="1"
                value={passengersCount}
                onChange={(e) => setPassengersCount(parseInt(e.target.value))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Earliest You Can Leave *
              </label>
              <Input
                type="datetime-local"
                value={earliestLeaveTime}
                onChange={(e) => setEarliestLeaveTime(e.target.value)}
                max={arrivalTimeForAvailability.slice(0, 16)}
                required
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {[15, 30, 45, 60, 75, 90, 120].map((minutes) => (
                  <Button
                    key={minutes}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEarliestLeaveTime(
                        formatDatetimeLocal(
                          subMinutes(
                            new Date(arrivalTimeForAvailability),
                            minutes
                          )
                        )
                      );
                    }}
                  >
                    {minutes < 60
                      ? `${minutes} min before`
                      : minutes === 60
                        ? "1 hr before"
                        : minutes % 60 === 0
                          ? `${minutes / 60} hr before`
                          : `${Math.floor(minutes / 60)} hr ${minutes % 60} min before`}
                  </Button>
                ))}
              </div>
              {earliestLeaveTime && (
                <p className="text-sm text-gray-600 mt-1">{getTimeBefore()}</p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">
            Where are you coming from? *
          </label>
          <AddressSelectorAndCard
            onNewValidatedLocation={setSelectedLocation}
            ownerType="user"
            ownerId={session?.user?.id ?? ""}
            selectedLocation={selectedLocation}
          />
        </div>

        {event.kind === "commute" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">
                Where are you going? *
              </label>
              <AddressSelectorAndCard
                onNewValidatedLocation={setSelectedDestination}
                ownerType="user"
                ownerId={session?.user?.id ?? ""}
                selectedLocation={selectedDestination}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Required Arrival Time *
              </label>
              <Input
                type="datetime-local"
                value={requiredArrivalTime}
                onChange={(e) => setRequiredArrivalTime(e.target.value)}
                required
              />
            </div>
          </>
        )}

        {seriesSuggestions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Use Previous Details</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {seriesSuggestions.map((attendance) => {
                const leaveOffset =
                  attendance.earliestLeaveTime &&
                  attendance.drivingStatus !== "cannot_drive"
                    ? differenceInMinutes(
                        new Date(
                          event.kind === "commute" &&
                            attendance.requiredArrivalTime
                            ? attendance.requiredArrivalTime
                            : attendance.eventTime
                        ),
                        new Date(attendance.earliestLeaveTime)
                      )
                    : null;
                const arrivalOffset = attendance.requiredArrivalTime
                  ? differenceInMinutes(
                      new Date(attendance.requiredArrivalTime),
                      new Date(attendance.eventTime)
                    )
                  : 0;

                if (event.kind === "commute") {
                  return (
                    <div
                      key={`${attendance.originLocationId}:${attendance.destinationLocationId}`}
                      className="min-w-72 overflow-hidden rounded-lg border bg-white text-sm"
                    >
                      <button
                        type="button"
                        className="block w-full p-3 text-left hover:bg-gray-50"
                        onClick={() => applyOriginAttendance(attendance)}
                      >
                        <div className="text-xs font-medium uppercase text-gray-400">
                          Origin
                        </div>
                        <div className="font-medium truncate">
                          {attendance.originLocation?.name}
                        </div>
                        <div className="text-gray-500">
                          {drivingStatusLabel(attendance.drivingStatus)}
                          {attendance.carFits
                            ? `, ${attendance.carFits} seats`
                            : ""}
                        </div>
                        <div className="text-gray-500">
                          {offsetLabel(leaveOffset)}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="block w-full border-t p-3 text-left hover:bg-gray-50"
                        onClick={() => applyDestinationAttendance(attendance)}
                      >
                        <div className="text-xs font-medium uppercase text-gray-400">
                          Destination
                        </div>
                        <div className="font-medium truncate">
                          {attendance.destinationLocation?.name}
                        </div>
                        <div className="text-gray-500">
                          {arrivalOffset === 0
                            ? "Event time"
                            : `${arrivalOffset > 0 ? "+" : ""}${arrivalOffset} min`}
                        </div>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={attendance.originLocationId}
                    type="button"
                    className="min-w-64 rounded-lg border bg-white p-3 text-left text-sm hover:bg-gray-50"
                    onClick={() => applyOriginAttendance(attendance)}
                  >
                    <div className="font-medium truncate">
                      {attendance.originLocation?.name}
                    </div>
                    <div className="text-gray-500">
                      {drivingStatusLabel(attendance.drivingStatus)}
                      {attendance.carFits
                        ? `, ${attendance.carFits} seats`
                        : ""}
                    </div>
                    <div className="text-gray-500">
                      {offsetLabel(leaveOffset)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={
                attendEvent.isPending ||
                updateAttendance.isPending ||
                !selectedLocation ||
                (event.kind === "commute" && !selectedDestination)
              }
            >
              {attendEvent.isPending || updateAttendance.isPending
                ? "Submitting..."
                : event.hasJoined
                  ? "Update Attendance"
                  : "Join Event"}
            </Button>
            {event.hasJoined && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditingAttendance(false)}
                disabled={attendEvent.isPending || updateAttendance.isPending}
              >
                Cancel
              </Button>
            )}
          </div>
          {event.hasJoined && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowLeaveConfirm(true)}
              disabled={
                attendEvent.isPending ||
                updateAttendance.isPending ||
                leaveEvent.isPending
              }
              className="w-full"
            >
              Leave Event
            </Button>
          )}
        </div>
      </form>

      <Dialog
        open={showLeaveConfirm}
        onClose={() => {
          if (!leaveEvent.isPending) setShowLeaveConfirm(false);
        }}
      >
        <h2 className="text-xl font-bold mb-4">Leave Event</h2>
        <p className="mb-6">
          Are you sure you want to leave this event? Your attendance information
          will be removed.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowLeaveConfirm(false)}
            disabled={leaveEvent.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={leaveEvent.isPending}
            data-autofocus
          >
            {leaveEvent.isPending ? "Leaving..." : "Leave Event"}
          </Button>
        </div>
      </Dialog>
    </>
  );

  // If renderAsButton is true, we're rendering in the attendance card header
  if (renderAsButton) {
    if (!event.hasJoined || !event.scheduled || event.locked) return null;

    if (!isEditingAttendance) {
      return (
        <Button size="sm" variant="secondary" onClick={openAttendanceForm}>
          Edit Attendance
        </Button>
      );
    }

    // When editing, render form in an absolute positioned container that appears below the card
    return (
      <div className="absolute left-0 right-0 top-full mt-6 z-10">
        <div className="bg-white p-6 rounded-lg border shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Edit Your Attendance</h2>
          {formContent}
        </div>
      </div>
    );
  }

  // Regular mode: for joining event initially
  if (!event.hasJoined && event.scheduled && !event.locked) {
    const heading = title === undefined ? "Join Event" : title;

    if (presentation === "plain") {
      return (
        <>
          {heading && <h2 className="text-xl font-semibold mb-4">{heading}</h2>}
          {formContent}
        </>
      );
    }

    return (
      <div className="bg-white p-6 rounded-lg border">
        {heading && <h2 className="text-xl font-semibold mb-4">{heading}</h2>}
        {formContent}
      </div>
    );
  }

  return null;
}
