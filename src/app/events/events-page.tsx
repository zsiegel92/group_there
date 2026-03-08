"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";

import {
  AdminBadge,
  JoinedBadge,
  NotJoinedBadge,
} from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useEvents } from "../api/events/client";
import { useGroups } from "../api/groups/client";
import { EventStatus } from "./[id]/event-status";

type LocationSummary = {
  id: string;
  name: string;
  addressString: string;
  city: string | null;
  state: string | null;
} | null;

type GroupedEvents = {
  group: {
    id: string;
    name: string;
  };
  eventsForGroup: Array<{
    id: string;
    name: string;
    location: LocationSummary;
    time: string;
    message: string | null;
    scheduled: boolean;
    locked: boolean;
    createdAt: string;
    hasJoined: boolean;
    isGroupAdmin: boolean;
  }>;
};

function EventCard({
  event,
}: {
  event: GroupedEvents["eventsForGroup"][number];
}) {
  const eventDate = new Date(event.time);
  const linkText = event.hasJoined ? "View/Edit Attendance" : "Join Event";

  return (
    <Link
      href={`/events/${event.id}`}
      className="block p-4 bg-white border rounded-lg hover:border-gray-400 transition-colors"
    >
      <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
        <h3 className="text-lg font-medium">{event.name}</h3>
        <div className="flex gap-2">
          {event.isGroupAdmin && <AdminBadge />}
          {event.hasJoined ? <JoinedBadge /> : <NotJoinedBadge />}
        </div>
      </div>
      <div className="text-sm text-gray-600 space-y-1">
        <div>
          <span className="font-medium">When:</span>{" "}
          {format(eventDate, "MM/dd/yyyy h:mm a")}
        </div>
        <div>
          <span className="font-medium">Where:</span>{" "}
          {event.location ? event.location.name : "No location set"}
        </div>
        {event.message && (
          <div className="mt-2 text-gray-700">{event.message}</div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-blue-600 text-sm font-medium">{linkText} →</span>
        <EventStatus
          scheduled={event.scheduled}
          locked={event.locked}
          compact
        />
      </div>
    </Link>
  );
}

export function EventsPage({ groupId }: { groupId?: string }) {
  const { data, isLoading, error } = useEvents(groupId);
  const { data: groupsData, isLoading: groupsLoading } = useGroups();

  const groupedEvents = useMemo(() => {
    if (!data?.events) return [];

    const groupMap = data.events.reduce<Map<string, GroupedEvents>>(
      (acc, event) => {
        const gId = event.group.id;
        if (!acc.has(gId)) {
          acc.set(gId, {
            group: event.group,
            eventsForGroup: [],
          });
        }
        const groupData = acc.get(gId);
        if (groupData) {
          groupData.eventsForGroup.push({
            id: event.eventDetails.id,
            name: event.eventDetails.name,
            location: event.eventDetails.location,
            time: event.eventDetails.time,
            message: event.eventDetails.message,
            scheduled: event.eventDetails.scheduled,
            locked: event.eventDetails.locked,
            createdAt: event.eventDetails.createdAt,
            hasJoined: event.hasJoined,
            isGroupAdmin: event.isGroupAdmin,
          });
        }
        return acc;
      },
      new Map()
    );

    return Array.from(groupMap.values());
  }, [data]);

  if (isLoading || (!groupId && groupsLoading)) {
    return (
      <div
        className={`flex justify-center items-center ${groupId ? "py-8" : "min-h-[50vh]"}`}
      >
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className={groupId ? "" : "container mx-auto px-4 py-8"}>
        <div className="text-red-600">
          Error loading events: {error.message}
        </div>
      </div>
    );
  }

  const totalEvents = data?.events.length ?? 0;

  // When embedded in a group page, render as a section
  if (groupId) {
    const events = groupedEvents[0]?.eventsForGroup ?? [];
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Events ({events.length})</h2>
        {events.length === 0 ? (
          <p className="text-gray-600">No events yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full page layout
  const isAdminOfAnyGroup =
    groupsData?.groups.some((gm) => gm.isAdmin) ?? false;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Events</h1>
        {isAdminOfAnyGroup && (
          <Link href="/events/create">
            <Button>Create Event</Button>
          </Link>
        )}
      </div>

      {totalEvents === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">
            No events yet. Group admins can create events for their groups.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedEvents.map((groupData) => (
            <div key={groupData.group.id} className="space-y-4">
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">
                  {groupData.group.name}
                </h2>
                <div className="space-y-3">
                  {groupData.eventsForGroup.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
