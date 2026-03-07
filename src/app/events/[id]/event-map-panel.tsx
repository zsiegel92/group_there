"use client";

import { useState } from "react";

import { EventLocationsMap } from "@/components/map/event-locations-map";
import { ROUTE_COLORS, type Route } from "@/components/map/map-container";
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
}: {
  event: EventForPanel;
  eventId: string;
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
      <EventLocationsMap event={event} routes={routes} />

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
              <div className="bg-white p-4 rounded-lg border">
                <h3 className="font-medium mb-2">
                  {solution.feasible
                    ? `Solution found — ${solution.parties.length} carpool${solution.parties.length === 1 ? "" : "s"}`
                    : "No feasible solution found"}
                </h3>
                {solution.feasible && (
                  <div className="space-y-2">
                    {solution.parties.map((party, i) => {
                      const driverName = event.attendees.find(
                        (a) => a.userId === party.driver_tripper_id
                      )?.userName;
                      const passengerNames = party.passenger_tripper_ids.map(
                        (pid) =>
                          event.attendees.find((a) => a.userId === pid)
                            ?.userName ?? pid
                      );
                      const color =
                        ROUTE_COLORS[i % ROUTE_COLORS.length]!;
                      return (
                        <div
                          key={party.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span
                            className="inline-block w-3 h-3 rounded-full mt-0.5 shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span>
                            <span className="font-medium">
                              {driverName ?? party.driver_tripper_id}
                            </span>
                            {passengerNames.length > 0 && (
                              <span className="text-gray-600">
                                {" picks up "}
                                {passengerNames.join(", ")}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    <div className="text-xs text-gray-500 mt-2">
                      Total drive time:{" "}
                      {Math.round(solution.total_drive_seconds / 60)} minutes
                    </div>
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
