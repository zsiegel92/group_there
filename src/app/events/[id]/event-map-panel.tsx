"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

import { EventLocationsMap } from "@/components/map/event-locations-map";
import { ROUTE_COLORS, type Route } from "@/components/map/map-container";
import { YouBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { decodePolyline } from "@/lib/geo/polyline";
import type { Location } from "@/lib/geo/schema";
import type { Problem, Solution } from "@/python-client";

import {
  fetchRoutePolylines,
  useConfirmItinerary,
  useUnlockEvent,
  type EventDetail,
} from "../../api/events/client";
import { solveProblem, type PartyEstimate } from "./solve-action";

type EventForPanel = {
  location: Location | null;
  locationId: string | null;
  locked: boolean;
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
  solution?: EventDetail["solution"];
};

export function EventMapPanel({
  event,
  eventId,
  currentUserId,
  onSolutionGenerated,
}: {
  event: EventForPanel;
  eventId: string;
  currentUserId: string | undefined;
  onSolutionGenerated?: (result: {
    problem: Problem;
    solution: Solution;
  }) => void;
}) {
  if (event.locked) {
    return (
      <LockedSolutionView
        event={event}
        eventId={eventId}
        currentUserId={currentUserId}
      />
    );
  }

  return (
    <EphemeralSolutionView
      event={event}
      eventId={eventId}
      currentUserId={currentUserId}
      onSolutionGenerated={onSolutionGenerated}
    />
  );
}

function EphemeralSolutionView({
  event,
  eventId,
  currentUserId,
  onSolutionGenerated,
}: {
  event: EventForPanel;
  eventId: string;
  currentUserId: string | undefined;
  onSolutionGenerated?: (result: {
    problem: Problem;
    solution: Solution;
  }) => void;
}) {
  const [solution, setSolution] = useState<Solution | null>(null);
  const [partyEstimates, setPartyEstimates] = useState<PartyEstimate[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);
  const confirmItinerary = useConfirmItinerary();

  const handleSolveProblem = async () => {
    setIsSolving(true);
    setSolution(null);
    setPartyEstimates([]);
    setRoutes([]);
    try {
      const result = await solveProblem(eventId);
      setSolution(result.solution);
      setPartyEstimates(result.partyEstimates);

      if (result.solution.feasible) {
        onSolutionGenerated?.({
          problem: result.problem,
          solution: result.solution,
        });
        if (result.solution.parties.length > 0) {
          await fetchAndBuildRoutes(result.solution);
        }
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

  const handleConfirmItinerary = () => {
    if (!solution || !solution.feasible) return;

    if (
      !confirm(
        "Confirm itineraries? This will lock the event and notify participants."
      )
    )
      return;

    const parties = solution.parties.map((party) => ({
      driverUserId: party.driver_tripper_id ?? "",
      passengerUserIds: party.passenger_tripper_ids,
    }));

    confirmItinerary.mutate({
      eventId,
      input: {
        parties,
        totalDriveSeconds: solution.total_drive_seconds,
        feasible: solution.feasible,
        optimal: solution.optimal,
      },
    });
  };

  const fetchAndBuildRoutes = async (sol: Solution) => {
    if (!event.locationId) return;

    setIsFetchingRoutes(true);
    try {
      const userLocationMap = new Map<string, string>();
      for (const att of event.attendees) {
        if (att.userAttendance.originLocationId) {
          userLocationMap.set(att.userId, att.userAttendance.originLocationId);
        }
      }

      const userNameMap = new Map<string, string>();
      for (const att of event.attendees) {
        userNameMap.set(att.userId, att.userName);
      }

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

        const locationIds = [driverLocId];
        for (const passId of party.passenger_tripper_ids) {
          const locId = userLocationMap.get(passId);
          if (locId) locationIds.push(locId);
        }
        locationIds.push(event.locationId);

        const driverName = userNameMap.get(driverId) ?? "Driver";
        partySequences.push({ locationIds, label: `${driverName}'s car` });

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

      const uniquePairs = [
        ...new Map(
          allPairs.map((p) => [
            `${p.originLocationId}:${p.destinationLocationId}`,
            p,
          ])
        ).values(),
      ];

      const { polylines } = await fetchRoutePolylines(eventId, uniquePairs);

      const builtRoutes: Route[] = [];

      for (let pi = 0; pi < partySequences.length; pi++) {
        const seq = partySequences[pi];
        if (!seq) continue;
        const color =
          ROUTE_COLORS[pi % ROUTE_COLORS.length] ??
          ROUTE_COLORS[0] ??
          "#16a34a";
        const coordinates: [number, number][] = [];

        for (let i = 0; i < seq.locationIds.length - 1; i++) {
          const key = `${seq.locationIds[i]}:${seq.locationIds[i + 1]}`;
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
      <EventLocationsMap
        event={event}
        routes={routes}
        currentUserId={currentUserId}
      />

      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Solution</h2>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleSolveProblem}
              disabled={isSolving}
              size="default"
            >
              {isSolving ? "Generating Solution..." : "Generate Solution"}
            </Button>
            {solution && solution.feasible && (
              <Button
                onClick={handleConfirmItinerary}
                disabled={confirmItinerary.isPending}
                variant="default"
              >
                {confirmItinerary.isPending
                  ? "Confirming..."
                  : "Confirm Itineraries"}
              </Button>
            )}
          </div>
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
            <SolutionCards
              solution={solution}
              partyEstimates={partyEstimates}
              event={event}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LockedSolutionView({
  event,
  eventId,
  currentUserId,
}: {
  event: EventForPanel;
  eventId: string;
  currentUserId: string | undefined;
}) {
  const unlockEvent = useUnlockEvent();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);

  const sol = event.solution;

  // Fetch route polylines on mount from persisted party data
  useEffect(() => {
    if (!sol || !event.locationId) return;

    const allPairs: {
      originLocationId: string;
      destinationLocationId: string;
    }[] = [];
    const partySequences: { locationIds: string[]; label: string }[] = [];

    for (const party of sol.parties) {
      const locationIds: string[] = [];
      for (const m of party.members) {
        if (m.originLocationId) {
          locationIds.push(m.originLocationId);
        }
      }
      locationIds.push(event.locationId);

      const driverName = party.driverName ?? "Driver";
      partySequences.push({ locationIds, label: `${driverName}'s car` });

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

    if (allPairs.length === 0) return;

    const uniquePairs = [
      ...new Map(
        allPairs.map((p) => [
          `${p.originLocationId}:${p.destinationLocationId}`,
          p,
        ])
      ).values(),
    ];

    let cancelled = false;
    void (async () => {
      setIsFetchingRoutes(true);
      try {
        const { polylines } = await fetchRoutePolylines(eventId, uniquePairs);
        if (cancelled) return;

        const builtRoutes: Route[] = [];

        for (let pi = 0; pi < partySequences.length; pi++) {
          const seq = partySequences[pi];
          if (!seq) continue;
          const color =
            ROUTE_COLORS[pi % ROUTE_COLORS.length] ??
            ROUTE_COLORS[0] ??
            "#16a34a";
          const coordinates: [number, number][] = [];

          for (let i = 0; i < seq.locationIds.length - 1; i++) {
            const key = `${seq.locationIds[i]}:${seq.locationIds[i + 1]}`;
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
            builtRoutes.push({ coordinates, color, label: seq.label });
          }
        }

        setRoutes(builtRoutes);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch route polylines:", err);
      } finally {
        if (!cancelled) setIsFetchingRoutes(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sol, event.locationId, eventId]);

  if (!sol) return null;

  return (
    <div className="space-y-4">
      <EventLocationsMap
        event={event}
        routes={routes}
        currentUserId={currentUserId}
      />

      {isFetchingRoutes && (
        <div className="flex items-center gap-2 text-gray-600">
          <Spinner />
          <span>Loading route polylines...</span>
        </div>
      )}

      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">
          Confirmed Solution — {sol.parties.length} carpool
          {sol.parties.length === 1 ? "" : "s"},{" "}
          {Math.round(sol.totalDriveSeconds / 60)} min total
        </h2>
        <div className="space-y-3">
          {sol.parties.map((party, i) => {
            const color = ROUTE_COLORS[i % ROUTE_COLORS.length] ?? "#16a34a";
            const driver = party.members.find((m) => m.pickupOrder === 0);
            const passengers = party.members
              .filter((m) => m.pickupOrder > 0)
              .sort((a, b) => a.pickupOrder - b.pickupOrder);

            return (
              <div
                key={party.id}
                className="bg-white rounded-lg border overflow-hidden"
              >
                <div className="h-1.5" style={{ backgroundColor: color }} />
                <div className="p-4 space-y-0">
                  {driver && (
                    <ItineraryRow
                      time={driver.estimatedPickup ?? null}
                      label="Depart"
                      name={driver.userName}
                      detail={driver.originLocation?.name ?? undefined}
                      email={driver.userEmail}
                      isYou={driver.userId === currentUserId}
                      isLast={false}
                    />
                  )}

                  {passengers.map((pass) => (
                    <ItineraryRow
                      key={pass.userId}
                      time={pass.estimatedPickup ?? null}
                      label="Pick up"
                      name={pass.userName}
                      detail={pass.originLocation?.name ?? undefined}
                      email={pass.userEmail}
                      isYou={pass.userId === currentUserId}
                      isLast={false}
                    />
                  ))}

                  {passengers.length === 0 && (
                    <div className="text-sm text-gray-400 italic pl-20 py-1">
                      Solo driver
                    </div>
                  )}

                  {event.location && (
                    <ItineraryRow
                      time={party.estimatedEventArrival ?? null}
                      label="Arrive"
                      name={event.location.name}
                      isYou={false}
                      isLast={true}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={() => {
              if (
                confirm(
                  "Unlocking will delete the confirmed itinerary. Are you sure?"
                )
              ) {
                unlockEvent.mutate(eventId);
              }
            }}
            disabled={unlockEvent.isPending}
          >
            {unlockEvent.isPending ? "Unlocking..." : "Unlock Event"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SolutionCards({
  solution,
  partyEstimates,
  event,
  currentUserId,
}: {
  solution: Solution;
  partyEstimates: PartyEstimate[];
  event: EventForPanel;
  currentUserId: string | undefined;
}) {
  return (
    <div>
      <h3 className="font-medium mb-3">
        {solution.feasible
          ? `Solution found — ${solution.parties.length} carpool${solution.parties.length === 1 ? "" : "s"}, ${Math.round(solution.total_drive_seconds / 60)} min total`
          : "No feasible solution found"}
      </h3>
      {solution.feasible && (
        <div className="space-y-3">
          {solution.parties.map((party, i) => {
            const color = ROUTE_COLORS[i % ROUTE_COLORS.length] ?? "#16a34a";
            const estimate = partyEstimates.find((e) => e.partyId === party.id);
            const driver = event.attendees.find(
              (a) => a.userId === party.driver_tripper_id
            );
            const passengers = party.passenger_tripper_ids.map((pid) =>
              event.attendees.find((a) => a.userId === pid)
            );

            const getStopTime = (userId: string) =>
              estimate?.stops.find((s) => s.userId === userId)?.estimatedTime ??
              null;

            return (
              <div
                key={party.id}
                className="bg-white rounded-lg border overflow-hidden"
              >
                <div className="h-1.5" style={{ backgroundColor: color }} />
                <div className="p-4 space-y-0">
                  {/* Driver stop */}
                  <ItineraryRow
                    time={driver ? getStopTime(driver.userId) : null}
                    label="Depart"
                    name={driver?.userName ?? "Unknown"}
                    detail={
                      driver?.userAttendance.originLocation?.name ?? undefined
                    }
                    email={driver?.userEmail}
                    isYou={driver?.userId === currentUserId}
                    isLast={false}
                  />

                  {/* Passenger stops */}
                  {passengers.map((pass, j) => (
                    <ItineraryRow
                      key={pass?.userId ?? j}
                      time={pass ? getStopTime(pass.userId) : null}
                      label="Pick up"
                      name={pass?.userName ?? "Unknown"}
                      detail={
                        pass?.userAttendance.originLocation?.name ?? undefined
                      }
                      email={pass?.userEmail}
                      isYou={pass?.userId === currentUserId}
                      isLast={false}
                    />
                  ))}

                  {passengers.length === 0 && (
                    <div className="text-sm text-gray-400 italic pl-20 py-1">
                      Solo driver
                    </div>
                  )}

                  {/* Arrival */}
                  <ItineraryRow
                    time={estimate?.estimatedEventArrival ?? null}
                    label="Arrive"
                    name={event.location?.name ?? "Event"}
                    isYou={false}
                    isLast={true}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItineraryRow({
  time,
  label,
  name,
  detail,
  email,
  isYou,
  isLast,
}: {
  time: string | null;
  label: string;
  name: string;
  detail?: string;
  email?: string | null;
  isYou: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-16 shrink-0 text-right text-sm text-gray-500 pt-0.5">
        {time ? `~${format(new Date(time), "h:mm a")}` : ""}
      </div>
      <div className="flex flex-col items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
        {!isLast && <div className="w-0.5 bg-blue-200 flex-1 min-h-4" />}
      </div>
      <div className="pb-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {label}
          </span>
          <span className="font-medium">{name}</span>
          {isYou && <YouBadge />}
        </div>
        {detail && <div className="text-sm text-gray-500 mt-0.5">{detail}</div>}
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
