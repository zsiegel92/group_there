"use client";

import { useMemo } from "react";

import type { Location } from "@/lib/geo/schema";

import LeafletMap from "./leaflet-map";
import { USE_PAID_MAPBOX, type MapPoint, type Route } from "./map-container";
import MapboxMap from "./mapbox-map";

type EventForMap = {
  location: Location | null;
  attendees: Array<{
    userId: string;
    userName: string;
    userAttendance: {
      originLocation: Location | null;
    };
  }>;
};

export function EventLocationsMap({
  event,
  routes = [],
  currentUserId,
}: {
  event: EventForMap;
  routes?: Route[];
  currentUserId?: string;
}) {
  const points = useMemo(() => {
    const result: MapPoint[] = [];

    if (
      event.location &&
      event.location.latitude != null &&
      event.location.longitude != null
    ) {
      result.push({
        latitude: event.location.latitude,
        longitude: event.location.longitude,
        label: event.location.name,
        variant: "destination",
      });
    }

    for (const attendee of event.attendees) {
      const origin = attendee.userAttendance.originLocation;
      if (origin && origin.latitude != null && origin.longitude != null) {
        const isYou = attendee.userId === currentUserId;
        result.push({
          latitude: origin.latitude,
          longitude: origin.longitude,
          label: isYou
            ? `You — ${origin.name}`
            : `${attendee.userName} — ${origin.name}`,
          variant: isYou ? "you" : "origin",
        });
      }
    }

    return result;
  }, [event, currentUserId]);

  if (points.length === 0) return null;

  const MapComponent = USE_PAID_MAPBOX ? MapboxMap : LeafletMap;

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Locations</h2>
      <div className="flex gap-4 text-sm text-gray-600 mb-3">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-red-600" />{" "}
          Destination
        </span>
        {points.some((p) => p.variant === "you") && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-teal-500" />{" "}
            You
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-600" />{" "}
          Attendee origins
        </span>
      </div>
      <MapComponent points={points} routes={routes} />
    </div>
  );
}
