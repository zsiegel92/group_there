"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type DrivingStatus } from "@/db/schema";
import { useSession } from "@/lib/auth-client";
import type { Solution } from "@/python-client";

import {
  useAttendEvent,
  useDeleteEvent,
  useEventDetails,
  useLeaveEvent,
  useScheduleEvent,
  useUnscheduleEvent,
  useUpdateAttendance,
  useUpdateEvent,
} from "../../api/events/client";
import { solveProblem } from "./solve-action";

export default function EventDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const eventId = params.id;
  const { data: session } = useSession();

  const { data, isLoading, error } = useEventDetails(eventId);
  const attendEvent = useAttendEvent();
  const updateAttendance = useUpdateAttendance();
  const leaveEvent = useLeaveEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const scheduleEvent = useScheduleEvent();
  const unscheduleEvent = useUnscheduleEvent();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);
  const [showUnscheduleConfirm, setShowUnscheduleConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isEditingAttendance, setIsEditingAttendance] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [isSolving, setIsSolving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editMessage, setEditMessage] = useState("");

  // Attendance form state
  const [drivingStatus, setDrivingStatus] =
    useState<DrivingStatus>("cannot_drive");
  const [passengersCount, setPassengersCount] = useState(1);
  const [earliestLeaveTime, setEarliestLeaveTime] = useState("");
  const [originLocation, setOriginLocation] = useState("");

  const event = data?.event;

  const handleAttendanceSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!event) return;

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
      event,
      drivingStatus,
      passengersCount,
      earliestLeaveTime,
      originLocation,
      eventId,
      updateAttendance,
      attendEvent,
    ]
  );

  const handleEditSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!event) return;

      try {
        await updateEvent.mutateAsync({
          eventId,
          input: {
            name: editName !== event.name ? editName : undefined,
            location:
              editLocation !== event.location ? editLocation : undefined,
            time: editTime !== event.time ? editTime : undefined,
            message:
              editMessage !== (event.message || "") ? editMessage : undefined,
          },
        });
        setShowEditForm(false);
        alert("Event updated successfully!");
      } catch (error) {
        console.error("Failed to update event:", error);
        alert("Failed to update event. Please try again.");
      }
    },
    [event, eventId, editName, editLocation, editTime, editMessage, updateEvent]
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteEvent.mutateAsync(eventId);
      router.push("/events");
    } catch (error) {
      console.error("Failed to delete event:", error);
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  }, [eventId, deleteEvent, router]);

  const handleSchedule = useCallback(async () => {
    try {
      await scheduleEvent.mutateAsync(eventId);
      setShowScheduleConfirm(false);
      alert("Event scheduled successfully!");
    } catch (error) {
      console.error("Failed to schedule event:", error);
      alert("Failed to schedule event. Please try again.");
    }
  }, [eventId, scheduleEvent]);

  const handleUnschedule = useCallback(async () => {
    try {
      await unscheduleEvent.mutateAsync(eventId);
      setShowUnscheduleConfirm(false);
      alert("Event unscheduled successfully!");
    } catch (error) {
      console.error("Failed to unschedule event:", error);
      alert("Failed to unschedule event. Please try again.");
    }
  }, [eventId, unscheduleEvent]);

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
  }, [eventId, leaveEvent]);

  const handleSolveProblem = useCallback(async () => {
    setIsSolving(true);
    setSolution(null);
    try {
      const result = await solveProblem(eventId);
      setSolution(result);
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
  }, [eventId]);

  const openEditForm = useCallback(() => {
    if (!event) return;
    setEditName(event.name);
    setEditLocation(event.location);
    // Convert ISO string to datetime-local format
    const timeDate = new Date(event.time);
    const year = timeDate.getFullYear();
    const month = String(timeDate.getMonth() + 1).padStart(2, "0");
    const day = String(timeDate.getDate()).padStart(2, "0");
    const hours = String(timeDate.getHours()).padStart(2, "0");
    const minutes = String(timeDate.getMinutes()).padStart(2, "0");
    setEditTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    setEditMessage(event.message || "");
    setShowEditForm(true);
  }, [event]);

  const openAttendanceForm = useCallback(() => {
    if (!event?.userAttendance) return;
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
  }, [event]);

  // Show attendance form if user hasn't joined yet OR is editing their attendance
  const showAttendanceForm = useMemo(() => {
    if (!event) return false;
    return !event.hasJoined || isEditingAttendance;
  }, [event, isEditingAttendance]);

  // Calculate time difference for display
  const getTimeBefore = useCallback(() => {
    if (!earliestLeaveTime || !event) return "";
    const eventDate = new Date(event.time);
    const leaveDate = new Date(earliestLeaveTime);
    const diffMs = eventDate.getTime() - leaveDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    return `${diffMinutes} minutes before the event`;
  }, [earliestLeaveTime, event]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-600">Error loading event: {error.message}</div>
      </div>
    );
  }

  if (!event) return null;

  const eventDate = new Date(event.time);
  const canDrive = drivingStatus !== "cannot_drive";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              {event.name}
            </h1>
            <p className="text-gray-600">Group: {event.groupName}</p>
          </div>
          {event.isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={openEditForm} size="sm">
                Edit Event
              </Button>
              {event.scheduled ? (
                <Button
                  variant="secondary"
                  onClick={() => setShowUnscheduleConfirm(true)}
                  size="sm"
                >
                  Unschedule
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setShowScheduleConfirm(true)}
                    size="sm"
                  >
                    Schedule Event
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    size="sm"
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {event.isAdmin && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
              Admin
            </span>
          )}
          {event.scheduled ? (
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
              Scheduled
            </span>
          ) : (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm">
              Unscheduled (Not visible to members)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Event Details</h2>
          <div className="space-y-2 text-gray-700">
            <div>
              <span className="font-medium">When:</span>{" "}
              {eventDate.toLocaleDateString()} at{" "}
              {eventDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div>
              <span className="font-medium">Where:</span> {event.location}
            </div>
            {event.message && (
              <div>
                <span className="font-medium">Message:</span>
                <p className="mt-1">{event.message}</p>
              </div>
            )}
          </div>
        </div>

        {event.scheduled && showAttendanceForm && (
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
                      Number of Passengers You Can Bring (not including
                      yourself) *
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={passengersCount}
                      onChange={(e) =>
                        setPassengersCount(parseInt(e.target.value))
                      }
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
                    disabled={
                      attendEvent.isPending || updateAttendance.isPending
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
                      disabled={
                        attendEvent.isPending || updateAttendance.isPending
                      }
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
        )}

        {event.attendees.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">
              Attendees ({event.attendees.length})
            </h2>
            <div className="space-y-3">
              {event.attendees
                .sort((a, b) => {
                  // Put current user first
                  const currentUserId = session?.user?.id;
                  if (a.userId === currentUserId) return -1;
                  if (b.userId === currentUserId) return 1;
                  return 0;
                })
                .map((attendee) => {
                  const isCurrentUser = session?.user?.id === attendee.userId;
                  return (
                    <div
                      key={attendee.userId}
                      className={`p-4 border rounded-lg ${
                        isCurrentUser
                          ? "bg-blue-50 border-blue-300"
                          : "bg-gray-50"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-medium">
                          {attendee.userName}
                          {isCurrentUser && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-800 rounded text-xs font-normal">
                              You
                            </span>
                          )}
                        </div>
                        {isCurrentUser && event.scheduled && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={openAttendanceForm}
                          >
                            Edit Attendance
                          </Button>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 space-y-1 mt-2">
                        <div>
                          <span className="font-medium">Status:</span>{" "}
                          {attendee.userAttendance.drivingStatus ===
                          "cannot_drive"
                            ? "Cannot Drive"
                            : attendee.userAttendance.drivingStatus ===
                                "must_drive"
                              ? "Must Drive"
                              : "Can Drive or Not Drive"}
                        </div>
                        {attendee.userAttendance.carFits &&
                        attendee.userAttendance.carFits > 0 ? (
                          <div>
                            <span className="font-medium">Passengers:</span>{" "}
                            {attendee.userAttendance.carFits - 1}
                          </div>
                        ) : null}
                        {attendee.userAttendance.earliestLeaveTime && (
                          <div>
                            <span className="font-medium">Can leave at:</span>{" "}
                            {new Date(
                              attendee.userAttendance.earliestLeaveTime
                            ).toLocaleString()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Coming from:</span>{" "}
                          {attendee.userAttendance.originLocation}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {event.isAdmin && (
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
        )}
      </div>

      {showEditForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Event</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Location
                </label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Date & Time
                </label>
                <Input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Message (optional)
                </label>
                <textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  className="w-full p-2 border rounded"
                  rows={4}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowEditForm(false)}
                  disabled={updateEvent.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Delete Event</h2>
            <p className="mb-6">
              Are you sure you want to delete this event? This action cannot be
              undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteEvent.isPending}
              >
                {deleteEvent.isPending ? "Deleting..." : "Delete Event"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showScheduleConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Schedule Event</h2>
            <p className="mb-6">
              This will make the event visible to all group members and they can
              start joining.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowScheduleConfirm(false)}
                disabled={scheduleEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSchedule}
                disabled={scheduleEvent.isPending}
              >
                {scheduleEvent.isPending ? "Scheduling..." : "Schedule Event"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showUnscheduleConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Unschedule Event</h2>
            <p className="mb-6">
              This will hide the event from group members. They will not be able
              to join until you schedule it again.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowUnscheduleConfirm(false)}
                disabled={unscheduleEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUnschedule}
                disabled={unscheduleEvent.isPending}
              >
                {unscheduleEvent.isPending
                  ? "Unscheduling..."
                  : "Unschedule Event"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
