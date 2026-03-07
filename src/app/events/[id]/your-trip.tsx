"use client";

import { useEffect, useMemo, useState } from "react";

import { EventLocationsMap } from "@/components/map/event-locations-map";
import { ROUTE_COLORS, type Route } from "@/components/map/map-container";
import { YouBadge } from "@/components/ui/badges";
import { Spinner } from "@/components/ui/spinner";
import { decodePolyline } from "@/lib/geo/polyline";
import type { Location } from "@/lib/geo/schema";

import { fetchRoutePolylines, type MyParty } from "../../api/events/client";

export function YourTrip({
  myParty,
  eventId,
  eventLocation,
  eventLocationId,
  currentUserId,
}: {
  myParty: MyParty;
  eventId: string;
  eventLocation: Location | null;
  eventLocationId: string | null;
  currentUserId: string;
}) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);

  // Build a mini event-like object for the map that only includes this party's members
  const miniEvent = useMemo(
    () => ({
      location: eventLocation,
      attendees: myParty.members.map((m) => ({
        userId: m.userId,
        userName: m.userName,
        userAttendance: {
          originLocation: m.originLocation,
        },
      })),
    }),
    [eventLocation, myParty.members]
  );

  useEffect(() => {
    if (!eventLocationId) return;

    const locationIds: string[] = [];
    for (const m of myParty.members) {
      if (m.originLocationId) {
        locationIds.push(m.originLocationId);
      }
    }
    locationIds.push(eventLocationId);

    if (locationIds.length < 2) return;

    const pairs: { originLocationId: string; destinationLocationId: string }[] =
      [];
    for (let i = 0; i < locationIds.length - 1; i++) {
      const origin = locationIds[i];
      const dest = locationIds[i + 1];
      if (origin && dest) {
        pairs.push({ originLocationId: origin, destinationLocationId: dest });
      }
    }

    if (pairs.length === 0) return;

    setIsFetchingRoutes(true);
    fetchRoutePolylines(eventId, pairs)
      .then(({ polylines }) => {
        const coordinates: [number, number][] = [];
        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i]!;
          const key = `${pair.originLocationId}:${pair.destinationLocationId}`;
          const encoded = polylines[key];
          if (encoded) {
            const decoded = decodePolyline(encoded);
            if (coordinates.length > 0 && decoded.length > 0) {
              coordinates.push(...decoded.slice(1));
            } else {
              coordinates.push(...decoded);
            }
          }
        }

        if (coordinates.length > 0) {
          const color = ROUTE_COLORS[myParty.partyIndex % ROUTE_COLORS.length] ?? ROUTE_COLORS[0] ?? "#16a34a";
          setRoutes([{ coordinates, color, label: "Your trip" }]);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch route polylines for your trip:", err);
      })
      .finally(() => {
        setIsFetchingRoutes(false);
      });
  }, [eventId, eventLocationId, myParty]);

  const driver = myParty.members.find((m) => m.pickupOrder === 0);
  const passengers = myParty.members
    .filter((m) => m.pickupOrder > 0)
    .sort((a, b) => a.pickupOrder - b.pickupOrder);

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden">
      <div className="bg-blue-50 px-6 py-4">
        <h2 className="text-xl font-semibold">Your Trip</h2>
        <p className="text-sm text-blue-700 mt-1">
          {myParty.role === "driver"
            ? "You are the Driver"
            : "You are a Passenger"}
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Driver */}
        {driver && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 w-14 shrink-0">
              Driver
            </span>
            <span className="font-medium">{driver.userName}</span>
            {driver.userId === currentUserId && <YouBadge />}
            {driver.earliestLeaveTime && (
              <span className="text-gray-500 text-sm">
                leaves at{" "}
                {new Date(driver.earliestLeaveTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {driver.originLocation && (
              <span className="text-gray-500 text-sm">
                from {driver.originLocation.name}
              </span>
            )}
          </div>
        )}

        {/* Passengers */}
        {passengers.map((pass) => (
          <div key={pass.userId} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 w-14 shrink-0">
              Rider
            </span>
            <span className="font-medium">{pass.userName}</span>
            {pass.userId === currentUserId && <YouBadge />}
            {pass.originLocation && (
              <span className="text-gray-500 text-sm">
                from {pass.originLocation.name}
              </span>
            )}
          </div>
        ))}

        {passengers.length === 0 && (
          <div className="text-sm text-gray-400 italic ml-16">Solo driver</div>
        )}

        {/* Destination */}
        {eventLocation && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 w-14 shrink-0">
              To
            </span>
            <span className="font-medium">{eventLocation.name}</span>
            {eventLocation.addressString && (
              <span className="text-gray-500 text-sm">
                ({eventLocation.addressString})
              </span>
            )}
          </div>
        )}

        {/* Mini map */}
        {isFetchingRoutes && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Spinner className="size-3.5" />
            Loading route...
          </div>
        )}
        <EventLocationsMap
          event={miniEvent}
          routes={routes}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
