"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db/db";
import { events, eventsToUsers, solutions } from "@/db/schema";
import { buildEstimateMembers, computePartyEstimates } from "@/lib/itinerary";
import { solveSolvePost } from "@/lib/python-client";
import { constructTripProblem } from "@/lib/trip-solver/construct-problem";
import type { Problem, Solution } from "@/python-client";

export type PartyEstimate = {
  partyId: string;
  stops: { userId: string; estimatedTime: string | null }[];
  estimatedEventArrival: string | null;
};

export async function solveProblem(eventId: string) {
  const problem = await constructTripProblem(eventId);
  const response = await solveSolvePost({
    body: problem,
  });

  if (response.error) {
    throw new Error(
      `Failed to solve problem: ${JSON.stringify(response.error)}`
    );
  }

  const solution = response.data;

  // Compute itinerary estimates for each party
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  const attendees = await db.query.eventsToUsers.findMany({
    where: eq(eventsToUsers.eventId, eventId),
  });

  if (!event || !solution.feasible) {
    return { problem, solution, partyEstimates: [] satisfies PartyEstimate[] };
  }

  const attendeeLookup = new Map(
    attendees.map((attendee) => [
      attendee.userId,
      {
        originLocationId: attendee.originLocationId,
        destinationLocationId: attendee.destinationLocationId,
        earliestLeaveTime: attendee.earliestLeaveTime,
        requiredArrivalTime: attendee.requiredArrivalTime,
      },
    ])
  );

  const partyEstimates = await Promise.all(
    solution.parties.map(async (party) => {
      const partyMembers = [
        ...(party.driver_tripper_id
          ? [{ userId: party.driver_tripper_id, pickupOrder: 0 }]
          : []),
        ...party.passenger_tripper_ids.map((userId, index) => ({
          userId,
          pickupOrder: party.driver_tripper_id ? index + 1 : index,
        })),
      ];
      const members = buildEstimateMembers(
        partyMembers,
        attendeeLookup,
        event.locationId,
        event.time
      );

      const { estimatedPickups, estimatedEventArrival } =
        await computePartyEstimates(
          members,
          event.locationId,
          event.time,
          event.kind
        );

      return {
        partyId: party.id,
        stops: members.map((m) => ({
          userId: m.userId,
          estimatedTime: estimatedPickups.get(m.userId)?.toISOString() ?? null,
        })),
        estimatedEventArrival: estimatedEventArrival?.toISOString() ?? null,
      } satisfies PartyEstimate;
    })
  );

  return { problem, solution, partyEstimates };
}

/**
 * Reconstruct the Problem + Solution from persisted DB data.
 * Used to show metrics for locked events without re-running the solver.
 */
export async function loadSolveResult(
  eventId: string
): Promise<{ problem: Problem; solution: Solution } | null> {
  const sol = await db.query.solutions.findFirst({
    where: eq(solutions.eventId, eventId),
    with: {
      parties: {
        with: { members: true },
      },
    },
  });

  if (!sol) return null;

  const problem = await constructTripProblem(eventId);

  const solution: Solution = {
    id: sol.id,
    kind: sol.problemKind,
    successfully_completed: true,
    feasible: sol.feasible,
    optimal: sol.optimal,
    total_drive_seconds: sol.totalDriveSeconds,
    external_rideshare_vehicle_count: sol.externalRideshareVehicleCount,
    total_external_rideshare_seconds: sol.totalExternalRideshareSeconds,
    total_external_rideshare_cost_seconds:
      sol.totalExternalRideshareCostSeconds,
    parties: sol.parties
      .sort((a, b) => a.partyIndex - b.partyIndex)
      .map((party) => ({
        id: party.id,
        vehicle_kind: party.vehicleKind,
        driver_tripper_id: party.driverUserId,
        external_rideshare_origin_id: party.externalRideshareOriginLocationId,
        cost_multiplier: party.costMultiplier,
        passenger_tripper_ids:
          party.vehicleKind === "external_rideshare"
            ? party.members
                .sort((a, b) => a.pickupOrder - b.pickupOrder)
                .map((m) => m.userId)
            : party.members
                .filter((m) => m.pickupOrder > 0)
                .sort((a, b) => a.pickupOrder - b.pickupOrder)
                .map((m) => m.userId),
      })),
  };

  return { problem, solution };
}
