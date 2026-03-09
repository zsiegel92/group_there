"use client";

import { useMemo } from "react";
import Link from "next/link";
import { differenceInSeconds, format } from "date-fns";

import { useDialog } from "@/components/dialog-provider";
import { EventLocationsMap } from "@/components/map/event-locations-map";
import { AdminBadge, YouBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import type { Location } from "@/lib/geo/schema";

import {
  useEventDetails,
  useUnlockEvent,
  type EventDetail,
} from "../../api/events/client";
import { AttendanceForm } from "./attendance-form";
import { BlastControls } from "./blast-controls";
import { DeleteEventButton } from "./delete-event-button";
import { DistanceStatus } from "./distance-status";
import { EditEventButton } from "./edit-event-button";
import { EventDetailsCard } from "./event-details-card";
import { EventMapPanel } from "./event-map-panel";
import { EventStatus } from "./event-status";
import { ScheduleEventButtons } from "./schedule-event-button";
import { YourTrip } from "./your-trip";

export function SocialEventDetailPage({ eventId }: { eventId: string }) {
  const { data: session } = useSession();
  const dialog = useDialog();

  const { data, isLoading, error } = useEventDetails(eventId);
  const unlockEvent = useUnlockEvent();

  const event = data?.event;

  if (isLoading) {
    return <SocialEventDetailPageSkeleton />;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-600">Error loading event: {error.message}</div>
      </div>
    );
  }

  if (!event) return null;

  const currentUserId = session?.user?.id;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              {event.name}
            </h1>
            <Link
              href={`/groups/${event.groupId}`}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors w-fit"
            >
              <span>Group: {event.groupName}</span>
              {event.isAdmin && <AdminBadge />}
            </Link>
          </div>
          {event.isAdmin && !event.locked && (
            <div className="flex flex-wrap gap-2">
              <EditEventButton event={event} eventId={eventId} />
              <ScheduleEventButtons
                eventId={eventId}
                isScheduled={event.scheduled}
              />
              {!event.scheduled && <DeleteEventButton eventId={eventId} />}
            </div>
          )}
          {event.isAdmin && event.locked && (
            <Button
              variant="secondary"
              onClick={async () => {
                const confirmed = await dialog.confirm(
                  "Unlocking will delete the confirmed itinerary. Are you sure?"
                );
                if (confirmed) {
                  unlockEvent.mutate(eventId);
                }
              }}
              disabled={unlockEvent.isPending}
            >
              {unlockEvent.isPending ? "Unlocking..." : "Unlock Event"}
            </Button>
          )}
        </div>
        <div className="mb-4">
          <EventStatus scheduled={event.scheduled} locked={event.locked} />
        </div>
        {event.isAdmin && <BlastControls event={event} eventId={eventId} />}
      </div>

      <div className="space-y-6">
        {/* Event Details */}
        <EventDetailsCard
          time={event.time}
          location={event.location}
          message={event.message}
        />

        {/* Your Trip card (locked + has party assignment) */}
        {event.locked && event.myParty && currentUserId && (
          <YourTrip
            myParty={event.myParty}
            eventId={eventId}
            eventLocation={event.location}
            eventLocationId={event.locationId}
            currentUserId={currentUserId}
          />
        )}

        {/* Non-admin map: show only event destination + user's origin when NOT locked */}
        {!event.isAdmin && !event.locked && (
          <NonAdminMap event={event} currentUserId={currentUserId} />
        )}

        {/* Attendance form: hide when locked */}
        {!event.locked && !event.hasJoined && (
          <AttendanceForm event={event} eventId={eventId} />
        )}

        {/* Your Attendance card */}
        {event.hasJoined &&
          (() => {
            // For admins, find from attendees array. For non-admins, construct from userAttendance
            const currentUserAttendee = event.isAdmin
              ? event.attendees?.find((a) => a.userId === currentUserId)
              : event.userAttendance
                ? {
                    userName: session?.user?.name ?? "You",
                    userId: currentUserId ?? "",
                    userAttendance: event.userAttendance,
                  }
                : null;

            if (!currentUserAttendee) return null;

            return (
              <div>
                <h2 className="text-xl font-semibold mb-4">Your Attendance</h2>
                <div className="space-y-3">
                  <div className="p-4 border rounded-lg bg-blue-50 border-blue-300 relative">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-medium">
                        {currentUserAttendee.userName}
                        <span className="ml-2">
                          <YouBadge />
                        </span>
                      </div>
                      {!event.locked && (
                        <AttendanceForm
                          event={event}
                          eventId={eventId}
                          renderAsButton={true}
                        />
                      )}
                    </div>
                    <div className="text-sm text-gray-600 space-y-1 mt-2">
                      <div>
                        <span className="font-medium">Status:</span>{" "}
                        {currentUserAttendee.userAttendance.drivingStatus ===
                        "cannot_drive"
                          ? "Cannot Drive"
                          : currentUserAttendee.userAttendance.drivingStatus ===
                              "must_drive"
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
                          {format(
                            new Date(
                              currentUserAttendee.userAttendance
                                .earliestLeaveTime
                            ),
                            "MM/dd/yyyy h:mm a"
                          )}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Coming from:</span>{" "}
                        {currentUserAttendee.userAttendance.originLocation
                          ? currentUserAttendee.userAttendance.originLocation
                              .name
                          : "Unknown"}
                      </div>
                    </div>
                    {(() => {
                      const att = currentUserAttendee.userAttendance;
                      if (
                        !att.earliestLeaveTime ||
                        att.directTravelSeconds == null
                      )
                        return null;
                      const availableSeconds = differenceInSeconds(
                        new Date(event.time),
                        new Date(att.earliestLeaveTime)
                      );
                      if (att.directTravelSeconds <= availableSeconds)
                        return null;
                      return (
                        <div className="mt-3 space-y-2">
                          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            Your departure time doesn&apos;t allow enough travel
                            time to reach the event on time.
                          </div>
                          {att.drivingStatus === "can_drive_or_not" && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                              It will not be possible for anyone else to pick
                              you up — you must either drive yourself or change
                              your departure time availability.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Non-admins: attendee count */}
        {!event.isAdmin && (
          <div className="text-gray-600">
            {event.attendeeCount} attendee{event.attendeeCount !== 1 ? "s" : ""}
          </div>
        )}

        {/* Admins: full attendee list */}
        {event.isAdmin && event.attendees && event.attendees.length > 0 && (
          <AdminAttendeeList
            attendees={event.attendees}
            currentUserId={currentUserId}
          />
        )}

        {/* Admins only: DistanceStatus + EventMapPanel */}
        {event.isAdmin && (
          <>
            <DistanceStatus eventId={eventId} isAdmin={event.isAdmin} />
            <EventMapPanel
              event={event}
              eventId={eventId}
              currentUserId={currentUserId}
            />
          </>
        )}
      </div>
    </div>
  );
}

function NonAdminMap({
  event,
  currentUserId,
}: {
  event: EventDetail;
  currentUserId: string | undefined;
}) {
  // Build a mini event for the map with only destination + user's origin
  const miniEvent = useMemo(() => {
    const attendees: {
      userId: string;
      userName: string;
      userAttendance: { originLocation: Location | null };
    }[] = [];

    if (
      event.hasJoined &&
      event.userAttendance?.originLocation &&
      currentUserId
    ) {
      attendees.push({
        userId: currentUserId,
        userName: "You",
        userAttendance: {
          originLocation: event.userAttendance.originLocation,
        },
      });
    }

    return {
      location: event.location,
      attendees,
    };
  }, [event, currentUserId]);

  if (!event.location) return null;

  return <EventLocationsMap event={miniEvent} currentUserId={currentUserId} />;
}

function AdminAttendeeList({
  attendees,
  currentUserId,
}: {
  attendees: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    userImage: string | null;
    userAttendance: {
      drivingStatus: string;
      carFits: number | null;
      earliestLeaveTime: string | null;
      originLocationId: string | null;
      originLocation: { name: string } | null;
      joinedAt: string;
    };
  }>;
  currentUserId: string | undefined;
}) {
  const otherAttendees = attendees.filter((a) => a.userId !== currentUserId);

  if (otherAttendees.length === 0) return null;

  return (
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
                {attendee.userAttendance.drivingStatus === "cannot_drive"
                  ? "Cannot Drive"
                  : attendee.userAttendance.drivingStatus === "must_drive"
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
                  {format(
                    new Date(attendee.userAttendance.earliestLeaveTime),
                    "MM/dd/yyyy h:mm a"
                  )}
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
  );
}

export function SocialEventDetailPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="mb-4">
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>
      </div>

      <div className="space-y-6">
        {/* Event Details card */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <Skeleton className="h-6 w-36 mb-4" />
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-56" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-18" />
              <Skeleton className="h-5 w-72" />
            </div>
          </div>
        </div>

        {/* Your Attendance card */}
        <div>
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="p-4 border rounded-lg bg-gray-50 space-y-3">
            <div className="flex justify-between items-start">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
            <div className="space-y-2 mt-2">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-8" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </div>
        </div>

        {/* Attendee count */}
        <Skeleton className="h-5 w-28" />

        {/* Map placeholder */}
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
