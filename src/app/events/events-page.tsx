"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  AdminBadge,
  JoinedBadge,
  NotJoinedBadge,
} from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { EventKind } from "@/db/schema";

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
  eventsForGroup: EventListItem[];
};

type EventListItem = {
  id: string;
  kind: EventKind;
  eventSeriesId: string | null;
  name: string;
  location: LocationSummary;
  time: string;
  message: string | null;
  scheduled: boolean;
  locked: boolean;
  createdAt: string;
  attendeeCount: number;
  hasJoined: boolean;
  isGroupAdmin: boolean;
  isTestingGroup: boolean;
};

function EventCard({ event }: { event: EventListItem }) {
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
          <span className="font-medium">Type:</span>{" "}
          {event.kind === "commute" ? "Commute" : "Shared destination"}
          {event.eventSeriesId ? " (recurring)" : ""}
        </div>
        <div>
          <span className="font-medium">
            {event.kind === "commute" ? "Destination:" : "Where:"}
          </span>{" "}
          {event.kind === "commute"
            ? "Set by each participant"
            : event.location
              ? event.location.name
              : "No location set"}
        </div>
        <div>
          <span className="font-medium">Participants:</span>{" "}
          {event.attendeeCount}
        </div>
        {event.message && (
          <div className="mt-2 text-gray-700">{event.message}</div>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="order-1 sm:order-2">
          <EventStatus
            scheduled={event.scheduled}
            locked={event.locked}
            compact
          />
        </div>
        <span className="order-2 text-blue-600 text-sm font-medium sm:order-1">
          {linkText} →
        </span>
      </div>
    </Link>
  );
}

function EventList({ events }: { events: EventListItem[] }) {
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<string>>(
    new Set()
  );

  const rows = useMemo(() => {
    const firstBySeriesId = new Set<string>();
    const eventsBySeriesId = new Map<string, EventListItem[]>();

    for (const event of events) {
      if (!event.eventSeriesId) continue;
      const seriesEvents = eventsBySeriesId.get(event.eventSeriesId) ?? [];
      seriesEvents.push(event);
      eventsBySeriesId.set(event.eventSeriesId, seriesEvents);
    }

    return events.flatMap((event) => {
      const seriesId = event.eventSeriesId;
      if (!seriesId) return [{ event, children: [] }];
      if (firstBySeriesId.has(seriesId)) return [];

      firstBySeriesId.add(seriesId);
      const seriesEvents = eventsBySeriesId.get(seriesId) ?? [event];
      const [firstEvent, ...children] = seriesEvents;
      return [{ event: firstEvent ?? event, children }];
    });
  }, [events]);

  const toggleSeries = (seriesId: string) => {
    setExpandedSeriesIds((current) => {
      const next = new Set(current);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {rows.map(({ event, children }) => {
        const seriesId = event.eventSeriesId;
        const isExpanded = seriesId ? expandedSeriesIds.has(seriesId) : false;
        const hasChildren = children.length > 0;
        const seriesEvents = [event, ...children];
        const seriesCounts = {
          total: seriesEvents.length,
          scheduled: seriesEvents.filter((seriesEvent) => seriesEvent.scheduled)
            .length,
          joined: seriesEvents.filter((seriesEvent) => seriesEvent.hasJoined)
            .length,
        };

        return (
          <div key={event.id} className="space-y-3">
            {hasChildren ? (
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  aria-label={
                    isExpanded
                      ? `Hide recurring events. ${seriesCounts.total} total, ${seriesCounts.scheduled} scheduled, ${seriesCounts.joined} joined.`
                      : `Show recurring events. ${seriesCounts.total} total, ${seriesCounts.scheduled} scheduled, ${seriesCounts.joined} joined.`
                  }
                  aria-expanded={isExpanded}
                  onClick={() => {
                    if (seriesId) toggleSeries(seriesId);
                  }}
                  className="w-20 shrink-0 rounded-md border bg-white px-2 py-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex flex-col items-stretch gap-2"
                >
                  <span className="grid gap-1.5 text-[10px] leading-none">
                    <span className="grid">
                      <span className="text-left text-gray-400">Total</span>
                      <span className="text-right text-sm font-medium text-gray-800">
                        {seriesCounts.total}
                      </span>
                    </span>
                    <span className="grid">
                      <span className="text-left text-gray-400">Scheduled</span>
                      <span className="text-right text-sm font-medium text-gray-800">
                        {seriesCounts.scheduled}
                      </span>
                    </span>
                    <span className="grid">
                      <span className="text-left text-gray-400">Joined</span>
                      <span className="text-right text-sm font-medium text-gray-800">
                        {seriesCounts.joined}
                      </span>
                    </span>
                  </span>
                  <span className="flex justify-center">
                    {isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <EventCard event={event} />
                </div>
              </div>
            ) : (
              <EventCard event={event} />
            )}

            {hasChildren && isExpanded && (
              <div className="ml-4 border-l border-gray-300 pl-6 space-y-3">
                {children.map((child) => (
                  <EventCard key={child.id} event={child} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
            kind: event.eventDetails.kind,
            eventSeriesId: event.eventDetails.eventSeriesId,
            name: event.eventDetails.name,
            location: event.eventDetails.location,
            time: event.eventDetails.time,
            message: event.eventDetails.message,
            scheduled: event.eventDetails.scheduled,
            locked: event.eventDetails.locked,
            createdAt: event.eventDetails.createdAt,
            attendeeCount: event.attendeeCount,
            hasJoined: event.hasJoined,
            isGroupAdmin: event.isGroupAdmin,
            isTestingGroup: event.group.type === "testing",
          });
        }
        return acc;
      },
      new Map()
    );

    // Sort testing groups to bottom
    return Array.from(groupMap.values()).sort((a, b) => {
      const aIsTesting = a.eventsForGroup[0]?.isTestingGroup ?? false;
      const bIsTesting = b.eventsForGroup[0]?.isTestingGroup ?? false;
      if (aIsTesting && !bIsTesting) return 1;
      if (!aIsTesting && bIsTesting) return -1;
      return 0;
    });
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
          <EventList events={events} />
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
          {groupedEvents.map((groupData) => {
            const isTesting =
              groupData.eventsForGroup[0]?.isTestingGroup ?? false;
            return (
              <div key={groupData.group.id} className="space-y-4">
                <div
                  className={
                    isTesting
                      ? "bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300"
                      : "bg-gray-50 p-6 rounded-lg border border-gray-200"
                  }
                >
                  <h2 className="text-xl font-semibold mb-4 text-gray-800">
                    {groupData.group.name}
                  </h2>
                  <EventList events={groupData.eventsForGroup} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
