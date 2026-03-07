"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

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
      if (m.originLocationId) locationIds.push(m.originLocationId);
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
          const color =
            ROUTE_COLORS[myParty.partyIndex % ROUTE_COLORS.length] ??
            ROUTE_COLORS[0] ??
            "#16a34a";
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
        {/* Itinerary as timeline */}
        <div className="space-y-0">
          {/* Driver */}
          {driver && (
            <ItineraryStop
              time={driver.estimatedPickup}
              label="Depart"
              name={driver.userName}
              isYou={driver.userId === currentUserId}
              address={driver.originLocation?.addressString ?? null}
              email={driver.userId !== currentUserId ? driver.userEmail : null}
              isLast={false}
            />
          )}

          {/* Passengers */}
          {passengers.map((pass) => (
            <ItineraryStop
              key={pass.userId}
              time={pass.estimatedPickup}
              label="Pick up"
              name={pass.userName}
              isYou={pass.userId === currentUserId}
              address={pass.originLocation?.addressString ?? null}
              email={pass.userId !== currentUserId ? pass.userEmail : null}
              isLast={false}
            />
          ))}

          {passengers.length === 0 && (
            <div className="text-sm text-gray-400 italic pl-20 py-2">
              Solo driver
            </div>
          )}

          {/* Destination */}
          {eventLocation && (
            <ItineraryStop
              time={myParty.estimatedEventArrival}
              label="Arrive"
              name={eventLocation.name}
              isYou={false}
              address={eventLocation.addressString ?? null}
              email={null}
              isLast={true}
            />
          )}
        </div>

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

function ItineraryStop({
  time,
  label,
  name,
  isYou,
  address,
  email,
  isLast,
}: {
  time: string | null;
  label: string;
  name: string;
  isYou: boolean;
  address: string | null;
  email: string | null;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-3">
      {/* Time column */}
      <div className="w-16 shrink-0 text-right text-sm text-gray-500 pt-0.5">
        {time ? `~${format(new Date(time), "h:mm a")}` : ""}
      </div>

      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
        {!isLast && <div className="w-0.5 bg-blue-200 flex-1 min-h-6" />}
      </div>

      {/* Content */}
      <div className="pb-4 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {label}
          </span>
          <span className="font-medium">{name}</span>
          {isYou && <YouBadge />}
        </div>
        {address && (
          <div className="text-sm text-gray-500 mt-0.5">{address}</div>
        )}
        {email && (
          <div className="text-sm text-gray-500 mt-0.5">
            <a
              href={`mailto:${email}`}
              className="text-blue-600 hover:underline"
            >
              {email}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
