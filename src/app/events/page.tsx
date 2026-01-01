"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useEvents } from "../api/events/client";
import { useGroups } from "../api/groups/client";

type GroupedEvents = {
  group: {
    id: string;
    name: string;
  };
  eventsForGroup: Array<{
    id: string;
    name: string;
    location: string;
    time: string;
    message: string | null;
    scheduled: boolean;
    createdAt: string;
    hasJoined: boolean;
    isGroupAdmin: boolean;
  }>;
};

export default function EventsPage() {
  const { data, isLoading, error } = useEvents();
  const { data: groupsData, isLoading: groupsLoading } = useGroups();

  const groupedEvents = useMemo(() => {
    if (!data?.events) return [];

    const groupMap = data.events.reduce<Map<string, GroupedEvents>>(
      (acc, event) => {
        const groupId = event.group.id;
        if (!acc.has(groupId)) {
          acc.set(groupId, {
            group: event.group,
            eventsForGroup: [],
          });
        }
        const groupData = acc.get(groupId);
        if (groupData) {
          groupData.eventsForGroup.push({
            id: event.eventDetails.id,
            name: event.eventDetails.name,
            location: event.eventDetails.location,
            time: event.eventDetails.time,
            message: event.eventDetails.message,
            scheduled: event.eventDetails.scheduled,
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

  if (isLoading || groupsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-600">
          Error loading events: {error.message}
        </div>
      </div>
    );
  }

  const totalEvents = data?.events.length || 0;
  const isAdminOfAnyGroup =
    groupsData?.groups.some((group) => group.isAdmin) || false;

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
                  {groupData.eventsForGroup.map((event) => {
                    const eventDate = new Date(event.time);
                    const linkText = event.hasJoined
                      ? "View/Edit Attendance"
                      : "Join Event";

                    return (
                      <Link
                        key={event.id}
                        href={`/events/${event.id}`}
                        className="block p-4 bg-white border rounded-lg hover:border-gray-400 transition-colors"
                      >
                        <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                          <h3 className="text-lg font-medium">{event.name}</h3>
                          <div className="flex gap-2">
                            {event.hasJoined ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                                Joined
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                Not Joined
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>
                            <span className="font-medium">When:</span>{" "}
                            {eventDate.toLocaleDateString()}{" "}
                            {eventDate.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          <div>
                            <span className="font-medium">Where:</span>{" "}
                            {event.location}
                          </div>
                          {event.message && (
                            <div className="mt-2 text-gray-700">
                              {event.message}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 text-blue-600 text-sm font-medium">
                          {linkText} →
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
