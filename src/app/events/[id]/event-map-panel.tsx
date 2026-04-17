"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";

import { useDialog } from "@/components/dialog-provider";
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

/**
 * Normalize persisted DB solution into the solver's canonical shape
 * so we can use a single rendering path for both locked and ephemeral solutions.
 */
function normalizeSolution(
  sol: EventDetail["solution"] | undefined
): { solution: Solution; partyEstimates: PartyEstimate[] } | null {
  if (!sol) return null;

  const solution: Solution = {
    id: sol.id,
    kind: sol.problemKind,
    successfully_completed: true,
    feasible: sol.feasible,
    optimal: sol.optimal,
    total_drive_seconds: sol.totalDriveSeconds,
    external_rideshare_vehicle_count: sol.externalRideshareVehicleCount,
    total_external_rideshare_cost_seconds:
      sol.totalExternalRideshareCostSeconds,
    parties: sol.parties
      .toSorted((a, b) => a.partyIndex - b.partyIndex)
      .map((party) => ({
        id: party.id,
        vehicle_kind: party.vehicleKind,
        driver_tripper_id: party.driverUserId,
        external_rideshare_origin_id: party.externalRideshareOriginLocationId,
        cost_multiplier: party.costMultiplier,
        passenger_tripper_ids: party.members
          .filter((m) => m.pickupOrder > 0)
          .toSorted((a, b) => a.pickupOrder - b.pickupOrder)
          .map((m) => m.userId),
      })),
  };

  const partyEstimates: PartyEstimate[] = sol.parties.map((party) => ({
    partyId: party.id,
    stops: party.members.map((m) => ({
      userId: m.userId,
      estimatedTime: m.estimatedPickup ?? null,
    })),
    estimatedEventArrival: party.estimatedEventArrival ?? null,
  }));

  return { solution, partyEstimates };
}

async function fetchAndBuildRoutes(
  solution: Solution,
  attendees: EventForPanel["attendees"],
  eventLocationId: string,
  eventId: string
): Promise<Route[]> {
  const userLocationMap = new Map<string, string>();
  for (const att of attendees) {
    if (att.userAttendance.originLocationId) {
      userLocationMap.set(att.userId, att.userAttendance.originLocationId);
    }
  }

  const userNameMap = new Map<string, string>();
  for (const att of attendees) {
    userNameMap.set(att.userId, att.userName);
  }

  const allPairs: {
    originLocationId: string;
    destinationLocationId: string;
  }[] = [];
  const partySequences: { locationIds: string[]; label: string }[] = [];

  for (const party of solution.parties) {
    const driverId = party.driver_tripper_id;
    if (!driverId) continue;

    const driverLocId = userLocationMap.get(driverId);
    if (!driverLocId) continue;

    const locationIds = [driverLocId];
    for (const passId of party.passenger_tripper_ids) {
      const locId = userLocationMap.get(passId);
      if (locId) locationIds.push(locId);
    }
    locationIds.push(eventLocationId);

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

  if (allPairs.length === 0) return [];

  const uniquePairs = [
    ...new Map(
      allPairs.map((p) => [
        `${p.originLocationId}:${p.destinationLocationId}`,
        p,
      ])
    ).values(),
  ];

  const { polylines } = await fetchRoutePolylines(eventId, uniquePairs);

  const routes: Route[] = [];

  for (let pi = 0; pi < partySequences.length; pi++) {
    const seq = partySequences[pi];
    if (!seq) continue;
    const color =
      ROUTE_COLORS[pi % ROUTE_COLORS.length] ?? ROUTE_COLORS[0] ?? "#16a34a";
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
      routes.push({ coordinates, color, label: seq.label });
    }
  }

  return routes;
}

export function EventMapPanel({
  event,
  eventId,
  currentUserId,
  onSolutionGenerated,
  onSolveStart,
}: {
  event: EventForPanel;
  eventId: string;
  currentUserId: string | undefined;
  onSolutionGenerated?: (result: {
    problem: Problem;
    solution: Solution;
  }) => void;
  onSolveStart?: () => void;
}) {
  const [ephemeralData, setEphemeralData] = useState<{
    solution: Solution;
    partyEstimates: PartyEstimate[];
  } | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(false);
  const confirmItinerary = useConfirmItinerary();
  const unlockEvent = useUnlockEvent();
  const dialog = useDialog();

  const lockedData = useMemo(
    () => normalizeSolution(event.solution),
    [event.solution]
  );

  const solution = ephemeralData?.solution ?? lockedData?.solution ?? null;
  const partyEstimates =
    ephemeralData?.partyEstimates ?? lockedData?.partyEstimates ?? [];

  // Refs so route-fetching effect doesn't depend on unstable object references
  const attendeesRef = useRef(event.attendees);
  attendeesRef.current = event.attendees;
  const solutionRef = useRef(solution);
  solutionRef.current = solution;

  // Use a stable scalar so React Query refetches (new object, same data)
  // don't cancel in-flight polyline fetches.
  const solutionId = solution?.id ?? null;

  // Fetch route polylines when solution becomes available, clear when removed
  useEffect(() => {
    const locationId = event.locationId;
    const sol = solutionRef.current;
    if (!sol || !solutionId || !locationId || !sol.feasible) {
      setRoutes([]);
      return;
    }
    if (sol.parties.length === 0) {
      setRoutes([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      setIsFetchingRoutes(true);
      try {
        const builtRoutes = await fetchAndBuildRoutes(
          sol,
          attendeesRef.current,
          locationId,
          eventId
        );
        if (!cancelled) setRoutes(builtRoutes);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch route polylines:", err);
      } finally {
        if (!cancelled) setIsFetchingRoutes(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [solutionId, event.locationId, eventId]);

  // For locked events without solution data (e.g., non-admin users), render nothing
  if (event.locked && !solution) return null;

  const handleSolveProblem = async () => {
    setIsSolving(true);
    setEphemeralData(null);
    setRoutes([]);
    onSolveStart?.();
    try {
      const result = await solveProblem(eventId);
      setEphemeralData({
        solution: result.solution,
        partyEstimates: result.partyEstimates,
      });
      if (result.solution.feasible) {
        onSolutionGenerated?.({
          problem: result.problem,
          solution: result.solution,
        });
      }
    } catch (error) {
      console.error("Failed to solve problem:", error);
      dialog.alert(
        error instanceof Error
          ? error.message
          : "Failed to generate solution. Please try again."
      );
    } finally {
      setIsSolving(false);
    }
  };

  const handleConfirmItinerary = async () => {
    if (!solution || !solution.feasible) return;

    const confirmed = await dialog.confirm(
      "Confirm itineraries? This will lock the event and notify participants."
    );
    if (!confirmed) return;

    const parties = solution.parties.map((party) => ({
      driverUserId: party.driver_tripper_id ?? null,
      passengerUserIds: party.passenger_tripper_ids,
      vehicleKind: party.vehicle_kind ?? "participant_vehicle",
      externalRideshareOriginLocationId:
        party.external_rideshare_origin_id ?? null,
      costMultiplier: party.cost_multiplier ?? 1,
    }));

    confirmItinerary.mutate({
      eventId,
      input: {
        parties,
        problemKind: solution.kind ?? "shared_destination",
        externalRideshareVehicleCount:
          solution.external_rideshare_vehicle_count ?? 0,
        totalExternalRideshareCostSeconds:
          solution.total_external_rideshare_cost_seconds ?? 0,
        totalDriveSeconds: solution.total_drive_seconds,
        feasible: solution.feasible,
        optimal: solution.optimal,
      },
    });
  };

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
        {event.locked && solution ? (
          <>
            <h2 className="text-xl font-semibold mb-4">
              Confirmed Solution — {solution.parties.length} carpool
              {solution.parties.length === 1 ? "" : "s"},{" "}
              {Math.round(solution.total_drive_seconds / 60)} min total
            </h2>
            <SolutionCards
              solution={solution}
              partyEstimates={partyEstimates}
              event={event}
              currentUserId={currentUserId}
              showHeading={false}
            />
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={async () => {
                  const confirmed = await dialog.confirm(
                    "Unlocking will delete the confirmed itinerary. Are you sure?"
                  );
                  if (confirmed) {
                    unlockEvent.mutate(eventId);
                  }
                }}
                disabled={unlockEvent.isPending}
              >
                {unlockEvent.isPending ? "Unlocking..." : "Unlock Event"}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Solution</h2>
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
            {isSolving && (
              <div className="flex items-center gap-2 text-gray-600">
                <Spinner />
                <span>Solving the problem...</span>
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
        )}
      </div>
    </div>
  );
}

function SolutionCards({
  solution,
  partyEstimates,
  event,
  currentUserId,
  showHeading = true,
}: {
  solution: Solution;
  partyEstimates: PartyEstimate[];
  event: EventForPanel;
  currentUserId: string | undefined;
  showHeading?: boolean;
}) {
  return (
    <div>
      {showHeading && (
        <h3 className="font-medium mb-3">
          {solution.feasible
            ? `Solution found — ${solution.parties.length} carpool${solution.parties.length === 1 ? "" : "s"}, ${Math.round(solution.total_drive_seconds / 60)} min total`
            : "No feasible solution found"}
        </h3>
      )}
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
