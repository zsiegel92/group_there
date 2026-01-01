"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";

import { useDeleteEvent, useEventDetails } from "../../api/events/client";
import { AttendanceForm } from "./AttendanceForm";
import { EditEventButton } from "./EditEventButton";
import { ScheduleEventButtons } from "./ScheduleEventButtons";
import { SolveProblem } from "./SolveProblem";

export default function EventDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const eventId = params.id;
  const { data: session } = useSession();

  const { data, isLoading, error } = useEventDetails(eventId);
  const deleteEvent = useDeleteEvent();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditingAttendance, setIsEditingAttendance] = useState(false);

  const event = data?.event;

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
              <EditEventButton event={event} eventId={eventId} />
              <ScheduleEventButtons
                eventId={eventId}
                isScheduled={event.scheduled}
              />
              {!event.scheduled && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  size="sm"
                >
                  Delete
                </Button>
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

        {!event.hasJoined && (
          <AttendanceForm
            event={event}
            eventId={eventId}
            isCurrentUser={true}
            isEditingAttendance={isEditingAttendance}
            setIsEditingAttendance={setIsEditingAttendance}
            mode="form-only"
          />
        )}

        {event.attendees.length > 0 && (() => {
          const currentUserId = session?.user?.id;
          const currentUserAttendee = event.attendees.find(
            (a) => a.userId === currentUserId
          );
          const otherAttendees = event.attendees.filter(
            (a) => a.userId !== currentUserId
          );

          return (
            <>
              {currentUserAttendee && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">
                    Your Attendance
                  </h2>
                  <div className="space-y-3">
                    <div className="p-4 border rounded-lg bg-blue-50 border-blue-300">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-medium">
                          {currentUserAttendee.userName}
                          <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-800 rounded text-xs font-normal">
                            You
                          </span>
                        </div>
                        {event.scheduled && (
                          <AttendanceForm
                            event={event}
                            eventId={eventId}
                            isCurrentUser={true}
                            isEditingAttendance={isEditingAttendance}
                            setIsEditingAttendance={setIsEditingAttendance}
                            mode="button-only"
                          />
                        )}
                      </div>
                      <div className="text-sm text-gray-600 space-y-1 mt-2">
                        <div>
                          <span className="font-medium">Status:</span>{" "}
                          {currentUserAttendee.userAttendance.drivingStatus ===
                          "cannot_drive"
                            ? "Cannot Drive"
                            : currentUserAttendee.userAttendance
                                  .drivingStatus === "must_drive"
                              ? "Must Drive"
                              : "Can Drive or Not Drive"}
                        </div>
                        {currentUserAttendee.userAttendance.carFits &&
                        currentUserAttendee.userAttendance.carFits > 0 ? (
                          <div>
                            <span className="font-medium">Passengers:</span>{" "}
                            {currentUserAttendee.userAttendance.carFits - 1}
                          </div>
                        ) : null}
                        {currentUserAttendee.userAttendance.earliestLeaveTime && (
                          <div>
                            <span className="font-medium">Can leave at:</span>{" "}
                            {new Date(
                              currentUserAttendee.userAttendance.earliestLeaveTime
                            ).toLocaleString()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Coming from:</span>{" "}
                          {currentUserAttendee.userAttendance.originLocation}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentUserAttendee && event.scheduled && isEditingAttendance && (
                <AttendanceForm
                  event={event}
                  eventId={eventId}
                  isCurrentUser={true}
                  isEditingAttendance={isEditingAttendance}
                  setIsEditingAttendance={setIsEditingAttendance}
                  mode="form-only"
                />
              )}

              {otherAttendees.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">
                    Other Attendees ({otherAttendees.length})
                  </h2>
                  <div className="space-y-3">
                    {otherAttendees.map((attendee) => (
                      <div
                        key={attendee.userId}
                        className="p-4 border rounded-lg bg-gray-50"
                      >
                        <div className="font-medium">{attendee.userName}</div>
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
                              <span className="font-medium">
                                Can leave at:
                              </span>{" "}
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
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {event.isAdmin && <SolveProblem eventId={eventId} />}
      </div>

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
    </div>
  );
}
