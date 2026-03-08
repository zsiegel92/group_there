"use client";

import { useCallback, useState } from "react";

import { AddressSelectorAndCard } from "@/components/address-selector-and-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DrivingStatus } from "@/db/schema";
import { useSession } from "@/lib/auth-client";
import type { Location } from "@/lib/geo/schema";

import {
  useAttendEvent,
  useLeaveEvent,
  useUpdateAttendance,
} from "../../api/events/client";

type Event = {
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
  } | null;
};

function formatDatetimeLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

type AttendanceFormProps = {
  event: Event;
  eventId: string;
  renderAsButton?: boolean;
};

export function AttendanceForm({
  event,
  eventId,
  renderAsButton = false,
}: AttendanceFormProps) {
  const { data: session } = useSession();
  const attendEvent = useAttendEvent();
  const updateAttendance = useUpdateAttendance();
  const leaveEvent = useLeaveEvent();

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

  const handleAttendanceSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!selectedLocation) {
        alert("Please select an origin location.");
        return;
      }

      // Convert passengersCount (form field, excludes driver) to carFits (API field, includes driver)
      const attendanceData = {
        drivingStatus,
        carFits: drivingStatus !== "cannot_drive" ? passengersCount + 1 : 0,
        earliestLeaveTime:
          drivingStatus !== "cannot_drive" && earliestLeaveTime
            ? earliestLeaveTime
            : null,
        originLocationId: selectedLocation.id,
        joinedAt: new Date().toISOString(),
      };

      try {
        if (event.hasJoined) {
          await updateAttendance.mutateAsync({
            eventId,
            input: attendanceData,
          });
          setIsEditingAttendance(false);
          alert("Attendance updated successfully!");
        } else {
          await attendEvent.mutateAsync({
            eventId,
            input: attendanceData,
          });
          setIsEditingAttendance(false);
          alert("Joined event successfully!");
        }
      } catch (error) {
        console.error("Failed to submit attendance:", error);
        if (error instanceof Error) {
          alert(error.message);
        }
      }
    },
    [
      drivingStatus,
      passengersCount,
      earliestLeaveTime,
      selectedLocation,
      eventId,
      updateAttendance,
      attendEvent,
      event.hasJoined,
      setIsEditingAttendance,
    ]
  );

  const handleLeave = useCallback(async () => {
    try {
      await leaveEvent.mutateAsync(eventId);
      setShowLeaveConfirm(false);
      setIsEditingAttendance(false);
      alert("You have left the event.");
    } catch (error) {
      console.error("Failed to leave event:", error);
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  }, [eventId, leaveEvent, setIsEditingAttendance]);

  const openAttendanceForm = useCallback(() => {
    if (!event.userAttendance) return;
    setDrivingStatus(event.userAttendance.drivingStatus);
    // Convert carFits (from API, includes driver) to passengersCount (form field, excludes driver)
    const carFits = event.userAttendance.carFits;
    setPassengersCount(carFits != null && carFits > 0 ? carFits - 1 : 1);
    if (event.userAttendance.earliestLeaveTime) {
      const leaveDate = new Date(event.userAttendance.earliestLeaveTime);
      const year = leaveDate.getFullYear();
      const month = String(leaveDate.getMonth() + 1).padStart(2, "0");
      const day = String(leaveDate.getDate()).padStart(2, "0");
      const hours = String(leaveDate.getHours()).padStart(2, "0");
      const minutes = String(leaveDate.getMinutes()).padStart(2, "0");
      setEarliestLeaveTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
    setSelectedLocation(event.userAttendance.originLocation);
    setIsEditingAttendance(true);
  }, [event.userAttendance, setIsEditingAttendance]);

  // Calculate time difference for display
  const getTimeBefore = useCallback(() => {
    if (!earliestLeaveTime) return "";
    const eventDate = new Date(event.time);
    const leaveDate = new Date(earliestLeaveTime);
    const diffMs = eventDate.getTime() - leaveDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    return `${diffMinutes} minutes before the event`;
  }, [earliestLeaveTime, event.time]);

  const canDrive = drivingStatus !== "cannot_drive";

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
              setDrivingStatus(
                e.target.value as
                  | "cannot_drive"
                  | "must_drive"
                  | "can_drive_or_not"
              )
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
                Number of Passengers You Can Bring (not including yourself) *
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
                max={event.time.slice(0, 16)}
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
                          new Date(
                            new Date(event.time).getTime() - minutes * 60_000
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

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={
                attendEvent.isPending ||
                updateAttendance.isPending ||
                !selectedLocation
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

      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Leave Event</h2>
            <p className="mb-6">
              Are you sure you want to leave this event? Your attendance
              information will be removed.
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
              >
                {leaveEvent.isPending ? "Leaving..." : "Leave Event"}
              </Button>
            </div>
          </div>
        </div>
      )}
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
    return (
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-xl font-semibold mb-4">Join Event</h2>
        {formContent}
      </div>
    );
  }

  return null;
}
