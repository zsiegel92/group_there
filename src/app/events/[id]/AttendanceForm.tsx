"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DrivingStatus } from "@/db/schema";

import {
  useAttendEvent,
  useLeaveEvent,
  useUpdateAttendance,
} from "../../api/events/client";

type Event = {
  time: string;
  hasJoined: boolean;
  scheduled: boolean;
  userAttendance: {
    drivingStatus: DrivingStatus;
    carFits: number | null;
    earliestLeaveTime: string | null;
    originLocation: string;
  } | null;
};

type AttendanceFormProps = {
  event: Event;
  eventId: string;
  isCurrentUser: boolean;
  isEditingAttendance: boolean;
  setIsEditingAttendance: (editing: boolean) => void;
  mode: "button-only" | "form-only" | "full";
};

export function AttendanceForm({
  event,
  eventId,
  isCurrentUser,
  isEditingAttendance,
  setIsEditingAttendance,
  mode,
}: AttendanceFormProps) {
  const attendEvent = useAttendEvent();
  const updateAttendance = useUpdateAttendance();
  const leaveEvent = useLeaveEvent();

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Attendance form state
  const [drivingStatus, setDrivingStatus] =
    useState<DrivingStatus>("cannot_drive");
  const [passengersCount, setPassengersCount] = useState(1);
  const [earliestLeaveTime, setEarliestLeaveTime] = useState("");
  const [originLocation, setOriginLocation] = useState("");

  const handleAttendanceSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Convert passengersCount (form field, excludes driver) to carFits (API field, includes driver)
      const attendanceData = {
        drivingStatus,
        carFits: drivingStatus !== "cannot_drive" ? passengersCount + 1 : 0,
        earliestLeaveTime:
          drivingStatus !== "cannot_drive" && earliestLeaveTime
            ? earliestLeaveTime
            : null,
        originLocation,
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
      originLocation,
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
    setOriginLocation(event.userAttendance.originLocation);
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

  // Button-only mode: render just the edit button
  if (mode === "button-only") {
    if (event.hasJoined && !isEditingAttendance && isCurrentUser) {
      return (
        <Button size="sm" variant="secondary" onClick={openAttendanceForm}>
          Edit Attendance
        </Button>
      );
    }
    return null;
  }

  // Form-only mode or full mode: render the form if appropriate
  const shouldShowForm =
    event.scheduled && (!event.hasJoined || isEditingAttendance);

  if (!shouldShowForm) {
    return null;
  }

  return (
    <>
      <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">
            {event.hasJoined ? "Edit Your Attendance" : "Join Event"}
          </h2>
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
                <option value="can_drive_or_not">
                  Can Drive or Not Drive
                </option>
              </select>
            </div>

            {canDrive && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Number of Passengers You Can Bring (not including yourself)
                    *
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
                  {earliestLeaveTime && (
                    <p className="text-sm text-gray-600 mt-1">
                      {getTimeBefore()}
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">
                Where are you coming from? *
              </label>
              <Input
                type="text"
                value={originLocation}
                onChange={(e) => setOriginLocation(e.target.value)}
                placeholder="Enter your starting location"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={attendEvent.isPending || updateAttendance.isPending}
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
        </div>

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
}
