"use client";

import { useState } from "react";

import { EventLocationsMap } from "@/components/map/event-locations-map";
import { ROUTE_COLORS, type Route } from "@/components/map/map-container";
import { YouBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { decodePolyline } from "@/lib/geo/polyline";
import type { Location } from "@/lib/geo/schema";
import type { Solution } from "@/python-client";

import { fetchRoutePolylines } from "../../api/events/client";
import { solveProblem } from "./solve-action";

type EventForPanel = {
  location: Location | null;
  locationId: string | null;
  attendees: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    userAttendance: {
      originLocationId: string | null;
      originLocation: Location | null;
    };
  }>;
  isAdmin: boolean;
};

export function EventMapPanel({
  event,
  eventId,
  currentUserId,
}: {
  event: EventForPanel;
  eventId: string;
  currentUserId: string | undefined;
}) {
  const [solution, setSolution] = useState<Solution | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);

  const handleSolveProblem = async () => {
    setIsSolving(true);
    setSolution(null);
    setRoutes([]);
    try {
      const result = await solveProblem(eventId);
      setSolution(result);

      if (result.feasible && result.parties.length > 0) {
        await fetchAndBuildRoutes(result);
      }
    } catch (error) {
      console.error("Failed to solve problem:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to generate solution. Please try again."
      );
    } finally {
      setIsSolving(false);
    }
  };

  const fetchAndBuildRoutes = async (sol: Solution) => {
    if (!event.locationId) return;

    setIsFetchingRoutes(true);
    try {
      // Build a map from userId → originLocationId
      const userLocationMap = new Map<string, string>();
      for (const att of event.attendees) {
        if (att.userAttendance.originLocationId) {
          userLocationMap.set(
            att.userId,
            att.userAttendance.originLocationId
          );
        }
      }

      // Build a map from userId → userName
      const userNameMap = new Map<string, string>();
      for (const att of event.attendees) {
        userNameMap.set(att.userId, att.userName);
      }

      // For each party, compute ordered location sequence and pairwise segments
      const allPairs: {
        originLocationId: string;
        destinationLocationId: string;
      }[] = [];

      const partySequences: { locationIds: string[]; label: string }[] = [];

      for (const party of sol.parties) {
        const driverId = party.driver_tripper_id;
        if (!driverId) continue;

        const driverLocId = userLocationMap.get(driverId);
        if (!driverLocId) continue;

        // Build ordered location sequence: driver → passengers → destination
        const locationIds = [driverLocId];
        for (const passId of party.passenger_tripper_ids) {
          const locId = userLocationMap.get(passId);
          if (locId) locationIds.push(locId);
        }
        locationIds.push(event.locationId);

        const driverName = userNameMap.get(driverId) ?? "Driver";
        partySequences.push({ locationIds, label: `${driverName}'s car` });

        // Generate pairwise segments
        for (let i = 0; i < locationIds.length - 1; i++) {
          const originId = locationIds[i];
          const destId = locationIds[i + 1];
          if (originId && destId) {
            allPairs.push({
              originLocationId: originId,
              destinationLocationId: destId,
            });
          }
        }
      }

      if (allPairs.length === 0) {
        setIsFetchingRoutes(false);
        return;
      }

      // Deduplicate pairs
      const uniquePairs = [
        ...new Map(
          allPairs.map((p) => [
            `${p.originLocationId}:${p.destinationLocationId}`,
            p,
          ])
        ).values(),
      ];

      const { polylines } = await fetchRoutePolylines(eventId, uniquePairs);

      // Build Route objects by concatenating decoded pairwise polylines
      const builtRoutes: Route[] = [];

      for (let pi = 0; pi < partySequences.length; pi++) {
        const seq = partySequences[pi];
        if (!seq) continue;
        const color = ROUTE_COLORS[pi % ROUTE_COLORS.length] ?? ROUTE_COLORS[0] ?? "#16a34a";
        const coordinates: [number, number][] = [];

        for (let i = 0; i < seq.locationIds.length - 1; i++) {
          const key = `${seq.locationIds[i]}:${seq.locationIds[i + 1]}`;
          const encoded = polylines[key];
          if (encoded) {
            const decoded = decodePolyline(encoded);
            // Skip first point of subsequent segments to avoid duplication
            if (coordinates.length > 0 && decoded.length > 0) {
              coordinates.push(...decoded.slice(1));
            } else {
              coordinates.push(...decoded);
            }
          }
        }

        if (coordinates.length > 0) {
          builtRoutes.push({ coordinates, color, label: seq.label });
        }
      }

      setRoutes(builtRoutes);
    } catch (error) {
      console.error("Failed to fetch route polylines:", error);
    } finally {
      setIsFetchingRoutes(false);
    }
  };

  return (
    <div className="space-y-4">
      <EventLocationsMap event={event} routes={routes} currentUserId={currentUserId} />

      {event.isAdmin && (
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Solution</h2>
          <div className="space-y-4">
            <Button
              onClick={handleSolveProblem}
              disabled={isSolving}
              size="default"
            >
              {isSolving ? "Generating Solution..." : "Generate Solution"}
            </Button>
            {(isSolving || isFetchingRoutes) && (
              <div className="flex items-center gap-2 text-gray-600">
                <Spinner />
                <span>
                  {isSolving
                    ? "Solving the problem..."
                    : "Loading route polylines..."}
                </span>
              </div>
            )}
            {solution && (
              <div>
                <h3 className="font-medium mb-3">
                  {solution.feasible
                    ? `Solution found — ${solution.parties.length} carpool${solution.parties.length === 1 ? "" : "s"}, ${Math.round(solution.total_drive_seconds / 60)} min total`
                    : "No feasible solution found"}
                </h3>
                {solution.feasible && (
                  <div className="space-y-3">
                    {solution.parties.map((party, i) => {
                      const color =
                        ROUTE_COLORS[i % ROUTE_COLORS.length] ?? "#16a34a";
                      const driver = event.attendees.find(
                        (a) => a.userId === party.driver_tripper_id
                      );
                      const passengers = party.passenger_tripper_ids.map(
                        (pid) => event.attendees.find((a) => a.userId === pid)
                      );

                      return (
                        <div
                          key={party.id}
                          className="bg-white rounded-lg border overflow-hidden"
                        >
                          <div
                            className="h-1.5"
                            style={{ backgroundColor: color }}
                          />
                          <div className="p-4 space-y-2">
                            {/* Driver */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium uppercase tracking-wide text-gray-400 w-14 shrink-0">
                                Driver
                              </span>
                              <span className="font-medium">
                                {driver?.userName ?? "Unknown"}
                              </span>
                              {driver?.userId === currentUserId && <YouBadge />}
                              {driver && (
                                <span className="text-gray-400 text-sm">
                                  {driver.userEmail}
                                </span>
                              )}
                              {driver?.userAttendance.originLocation && (
                                <span className="text-gray-500 text-sm">
                                  from{" "}
                                  {driver.userAttendance.originLocation.name}
                                </span>
                              )}
                            </div>

                            {/* Passengers */}
                            {passengers.map((pass, j) => (
                              <div
                                key={pass?.userId ?? j}
                                className="flex items-center gap-2 flex-wrap"
                              >
                                <span className="text-xs font-medium uppercase tracking-wide text-gray-400 w-14 shrink-0">
                                  Rider
                                </span>
                                <span className="font-medium">
                                  {pass?.userName ?? "Unknown"}
                                </span>
                                {pass?.userId === currentUserId && <YouBadge />}
                                {pass && (
                                  <span className="text-gray-400 text-sm">
                                    {pass.userEmail}
                                  </span>
                                )}
                                {pass?.userAttendance.originLocation && (
                                  <span className="text-gray-500 text-sm">
                                    from{" "}
                                    {pass.userAttendance.originLocation.name}
                                  </span>
                                )}
                              </div>
                            ))}

                            {passengers.length === 0 && (
                              <div className="text-sm text-gray-400 italic ml-16">
                                Solo driver
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
