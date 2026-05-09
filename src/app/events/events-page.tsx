"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Plus,
  UserPlus,
} from "lucide-react";

import { useDialog } from "@/components/dialog-provider";
import {
  AdminBadge,
  JoinedBadge,
  NotJoinedBadge,
} from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { EventKind } from "@/db/schema";
import {
  parseRecurrenceFrequency,
  type RecurrenceFrequency,
} from "@/lib/events/recurrence";
import { cn } from "@/lib/utils";

import {
  useEventDetails,
  useEvents,
  useExtendEventSeries,
  useScheduleEvent,
} from "../api/events/client";
import { useGroups } from "../api/groups/client";
import { AttendanceForm } from "./[id]/attendance-form";
import { EventStatus, type EventStatusSize } from "./[id]/event-status";

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

type EventCardAction = "join" | "schedule";

const eventCardBaseClassName =
  "overflow-hidden rounded-lg border-2 bg-white transition-colors duration-150";
const eventCardDefaultBorderClassName =
  "border-gray-200 md:hover:border-gray-400";
const eventCardLinkClassName =
  "block p-3 transition-colors duration-150 md:hover:bg-gray-50";

const eventCardActionButtonClassName =
  "h-11 w-full rounded-none border-x-0 border-b-0 border-t-2 bg-white text-sm font-semibold tracking-normal shadow-none transition-colors duration-150";

const eventCardActionClassNames = {
  join: "border-sky-200 text-sky-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900",
  schedule:
    "border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900",
} satisfies Record<EventCardAction, string>;

const eventCardBorderClassNamesByHoveredAction = {
  join: "border-sky-300",
  schedule: "border-emerald-300",
} satisfies Record<EventCardAction, string>;

function QuickJoinDialog({
  event,
  open,
  onClose,
}: {
  event: EventListItem;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useEventDetails(event.id);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <div className="mb-4">
        <h2 className="text-xl font-bold">Quick Join</h2>
        <p className="text-sm text-gray-600">{event.name}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <div className="text-red-600">Error loading event: {error.message}</div>
      ) : data?.event ? (
        <AttendanceForm
          event={data.event}
          eventId={event.id}
          presentation="plain"
          title={null}
          onSubmitted={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function QuickJoinButton({
  event,
  onHoverChange,
}: {
  event: EventListItem;
  onHoverChange: (isHovering: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          eventCardActionButtonClassName,
          eventCardActionClassNames.join
        )}
        onPointerEnter={() => onHoverChange(true)}
        onPointerLeave={() => onHoverChange(false)}
        onFocus={() => onHoverChange(true)}
        onBlur={() => onHoverChange(false)}
        onClick={() => setOpen(true)}
      >
        <UserPlus className="size-4" />
        join
      </Button>
      {open && (
        <QuickJoinDialog
          event={event}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EventCard({
  event,
  eventStatusSize = "medium",
}: {
  event: EventListItem;
  eventStatusSize?: EventStatusSize;
}) {
  const eventDate = new Date(event.time);
  const [hoveredAction, setHoveredAction] = useState<EventCardAction | null>(
    null
  );
  const linkText = !event.scheduled
    ? "View Event"
    : event.hasJoined
      ? "View/Edit Attendance"
      : "Join Event";
  const scheduleEvent = useScheduleEvent();
  const dialog = useDialog();

  const cardContent = (
    <>
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
        {event.message && event.scheduled && (
          <div className="mt-2 text-gray-700">{event.message}</div>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="order-1 sm:order-2">
          <EventStatus
            scheduled={event.scheduled}
            locked={event.locked}
            eventStatusSize={eventStatusSize}
          />
        </div>
        <span className="order-2 text-blue-600 text-sm font-medium sm:order-1">
          {linkText} →
        </span>
      </div>
    </>
  );

  if (event.scheduled && !event.hasJoined && !event.locked) {
    return (
      <div
        className={cn(
          eventCardBaseClassName,
          hoveredAction
            ? eventCardBorderClassNamesByHoveredAction[hoveredAction]
            : eventCardDefaultBorderClassName
        )}
      >
        <Link href={`/events/${event.id}`} className={eventCardLinkClassName}>
          {cardContent}
        </Link>
        <QuickJoinButton
          event={event}
          onHoverChange={(isHovering) =>
            setHoveredAction(isHovering ? "join" : null)
          }
        />
      </div>
    );
  }

  if (!event.scheduled && event.isGroupAdmin) {
    return (
      <div
        className={cn(
          eventCardBaseClassName,
          hoveredAction
            ? eventCardBorderClassNamesByHoveredAction[hoveredAction]
            : eventCardDefaultBorderClassName
        )}
      >
        <Link href={`/events/${event.id}`} className={eventCardLinkClassName}>
          {cardContent}
        </Link>
        <Button
          type="button"
          variant="outline"
          className={cn(
            eventCardActionButtonClassName,
            eventCardActionClassNames.schedule
          )}
          disabled={scheduleEvent.isPending}
          onPointerEnter={() => setHoveredAction("schedule")}
          onPointerLeave={() => setHoveredAction(null)}
          onFocus={() => setHoveredAction("schedule")}
          onBlur={() => setHoveredAction(null)}
          onClick={async () => {
            try {
              await scheduleEvent.mutateAsync(event.id);
            } catch (error) {
              if (error instanceof Error) dialog.alert(error.message);
            }
          }}
        >
          <CalendarPlus className="size-4" />
          {scheduleEvent.isPending ? "scheduling..." : "schedule"}
        </Button>
      </div>
    );
  }

  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "block rounded-lg border-2 bg-white p-4 transition-colors duration-150 md:hover:bg-gray-50",
        eventCardDefaultBorderClassName
      )}
    >
      {cardContent}
    </Link>
  );
}

function chooseSeriesHeader(events: EventListItem[]) {
  const now = Date.now();
  const sorted = events.toSorted(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  return (
    sorted.find((event) => new Date(event.time).getTime() >= now) ??
    sorted[sorted.length - 1]
  );
}

function ExtendSeriesButton({ event }: { event: EventListItem }) {
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("weekly");
  const [count, setCount] = useState(4);
  const extendSeries = useExtendEventSeries();
  const dialog = useDialog();

  return (
    <>
      <button
        type="button"
        aria-label="Extend recurring series"
        onClick={() => setOpen(true)}
        className="flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
      >
        <Plus className="size-4" />
      </button>
      <Dialog
        open={open}
        onClose={() => {
          if (!extendSeries.isPending) setOpen(false);
        }}
      >
        <h2 className="text-xl font-bold mb-4">Extend Series</h2>
        <form
          className="space-y-4"
          onSubmit={async (submitEvent) => {
            submitEvent.preventDefault();
            try {
              await extendSeries.mutateAsync({
                eventId: event.id,
                input: { frequency, count },
              });
              setOpen(false);
            } catch (error) {
              if (error instanceof Error) dialog.alert(error.message);
            }
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-2">Repeat</label>
            <select
              value={frequency}
              onChange={(changeEvent) =>
                setFrequency(parseRecurrenceFrequency(changeEvent.target.value))
              }
              className="w-full p-2 border rounded"
              disabled={extendSeries.isPending}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Occurrences
            </label>
            <Input
              type="number"
              min="1"
              max="52"
              value={count}
              onChange={(changeEvent) =>
                setCount(Number.parseInt(changeEvent.target.value, 10) || 1)
              }
              disabled={extendSeries.isPending}
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={extendSeries.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={extendSeries.isPending}>
              {extendSeries.isPending ? "Extending..." : "Extend Series"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
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
      const headerEvent = chooseSeriesHeader(seriesEvents) ?? event;
      const children = seriesEvents
        .filter((seriesEvent) => seriesEvent.id !== headerEvent.id)
        .toSorted(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
      return [{ event: headerEvent, children }];
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
            {hasChildren && isExpanded ? (
              <>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    aria-label={`Hide recurring events. ${seriesCounts.total} total, ${seriesCounts.scheduled} scheduled, ${seriesCounts.joined} joined.`}
                    aria-expanded={true}
                    onClick={() => {
                      if (seriesId) toggleSeries(seriesId);
                    }}
                    className="flex min-h-10 flex-1 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border-2 border-gray-200 bg-white px-3 py-2 text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-950"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <ChevronDown
                        className="size-5 shrink-0"
                        strokeWidth={3}
                      />
                      <span className="truncate">Collapse series</span>
                    </span>
                    <span className="flex min-w-0 flex-wrap justify-end gap-x-3 gap-y-1 text-xs leading-none">
                      <span>
                        <span className="text-gray-500">Total</span>{" "}
                        <span className="font-semibold text-gray-900">
                          {seriesCounts.total}
                        </span>
                      </span>
                      <span>
                        <span className="text-gray-500">Scheduled</span>{" "}
                        <span className="font-semibold text-gray-900">
                          {seriesCounts.scheduled}
                        </span>
                      </span>
                      <span>
                        <span className="text-gray-500">Joined</span>{" "}
                        <span className="font-semibold text-gray-900">
                          {seriesCounts.joined}
                        </span>
                      </span>
                    </span>
                  </button>
                  {event.isGroupAdmin && <ExtendSeriesButton event={event} />}
                </div>
                <div className="ml-4 space-y-3 border-l border-gray-300 pl-6">
                  <EventCard event={event} />
                  {children.map((child) => (
                    <EventCard key={child.id} event={child} />
                  ))}
                </div>
              </>
            ) : hasChildren ? (
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
                  className="flex w-20 shrink-0 cursor-pointer flex-col items-stretch gap-2 rounded-md border-2 border-gray-200 bg-white px-2 py-3 text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
                >
                  <span className="grid flex-1 gap-1.5 text-[10px] leading-none">
                    <span className="grid">
                      <span className="text-left text-gray-400">Total</span>
                      <span className="text-sm font-medium text-gray-800">
                        {seriesCounts.total}
                      </span>
                    </span>
                    <span className="grid">
                      <span className="text-left text-gray-400">Scheduled</span>
                      <span className="text-sm font-medium text-gray-800">
                        {seriesCounts.scheduled}
                      </span>
                    </span>
                    <span className="grid">
                      <span className="text-left text-gray-400">Joined</span>
                      <span className="text-sm font-medium text-gray-800">
                        {seriesCounts.joined}
                      </span>
                    </span>
                  </span>
                  <span className="mt-auto flex justify-center">
                    <ChevronRight className="size-5" strokeWidth={3} />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <EventCard event={event} eventStatusSize="small" />
                </div>
                {event.isGroupAdmin && <ExtendSeriesButton event={event} />}
              </div>
            ) : (
              <EventCard event={event} />
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

    for (const groupData of groupMap.values()) {
      groupData.eventsForGroup.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );
    }

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
