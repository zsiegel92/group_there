"use client";

import { use } from "react";

import { EventLocationsMap } from "@/components/map/event-locations-map";
import {
  AdminBadge,
  ScheduledBadge,
  UnscheduledBadge,
  YouBadge,
} from "@/components/ui/badges";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";

import { useEventDetails } from "../../api/events/client";
import { AttendanceForm } from "./attendance-form";
import { DeleteEventButton } from "./delete-event-button";
import { DistanceStatus } from "./distance-status";
import { EditEventButton } from "./edit-event-button";
import { ScheduleEventButtons } from "./schedule-event-button";
import { SolveProblem } from "./solve-problem";

export default function EventDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const eventId = params.id;
  const { data: session } = useSession();

  const { data, isLoading, error } = useEventDetails(eventId);

  const event = data?.event;

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
              {!event.scheduled && <DeleteEventButton eventId={eventId} />}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {event.isAdmin && <AdminBadge />}
          {event.scheduled ? <ScheduledBadge /> : <UnscheduledBadge />}
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
              <span className="font-medium">Where:</span>{" "}
              {event.location ? (
                <span>
                  {event.location.name}
                  {event.location.addressString && (
                    <span className="text-gray-500 text-sm ml-1">
                      ({event.location.addressString})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-400">No location set</span>
              )}
            </div>
            {event.message && (
              <div>
                <span className="font-medium">Message:</span>
                <p className="mt-1">{event.message}</p>
              </div>
            )}
          </div>
        </div>

        <EventLocationsMap event={event} />

        {!event.hasJoined && <AttendanceForm event={event} eventId={eventId} />}

        {event.attendees.length > 0 &&
          (() => {
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
                      <div className="p-4 border rounded-lg bg-blue-50 border-blue-300 relative">
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-medium">
                            {currentUserAttendee.userName}
                            <span className="ml-2">
                              <YouBadge />
                            </span>
                          </div>
                          <AttendanceForm
                            event={event}
                            eventId={eventId}
                            renderAsButton={true}
                          />
                        </div>
                        <div className="text-sm text-gray-600 space-y-1 mt-2">
                          <div>
                            <span className="font-medium">Status:</span>{" "}
                            {currentUserAttendee.userAttendance
                              .drivingStatus === "cannot_drive"
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
                          {currentUserAttendee.userAttendance
                            .earliestLeaveTime && (
                            <div>
                              <span className="font-medium">Can leave at:</span>{" "}
                              {new Date(
                                currentUserAttendee.userAttendance
                                  .earliestLeaveTime
                              ).toLocaleString()}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Coming from:</span>{" "}
                            {currentUserAttendee.userAttendance.originLocation
                              ? currentUserAttendee.userAttendance
                                  .originLocation.name
                              : "Unknown"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                              {attendee.userAttendance.originLocation
                                ? attendee.userAttendance.originLocation.name
                                : "Unknown"}
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

        <DistanceStatus eventId={eventId} isAdmin={event.isAdmin} />

        {event.isAdmin && <SolveProblem eventId={eventId} />}
      </div>
    </div>
  );
}
