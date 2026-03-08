"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db/db";
import { events, eventsToUsers } from "@/db/schema";
import { computePartyEstimates } from "@/lib/itinerary";
import { solveSolvePost } from "@/lib/python-client";
import { constructProblem } from "@/lib/solver/construct-problem";

export type PartyEstimate = {
  partyId: string;
  stops: { userId: string; estimatedTime: string | null }[];
  estimatedEventArrival: string | null;
};

export async function solveProblem(eventId: string) {
  const problem = await constructProblem(eventId);
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
    return { solution, partyEstimates: [] satisfies PartyEstimate[] };
  }

  const partyEstimates = await Promise.all(
    solution.parties.map(async (party) => {
      const members: {
        userId: string;
        originLocationId: string | null;
        earliestLeaveTime: Date | null;
        pickupOrder: number;
      }[] = [];

      if (party.driver_tripper_id) {
        const att = attendees.find(
          (a) => a.userId === party.driver_tripper_id
        );
        members.push({
          userId: party.driver_tripper_id,
          originLocationId: att?.originLocationId ?? null,
          earliestLeaveTime: att?.earliestLeaveTime ?? null,
          pickupOrder: 0,
        });
      }

      party.passenger_tripper_ids.forEach((pid, i) => {
        const att = attendees.find((a) => a.userId === pid);
        members.push({
          userId: pid,
          originLocationId: att?.originLocationId ?? null,
          earliestLeaveTime: att?.earliestLeaveTime ?? null,
          pickupOrder: i + 1,
        });
      });

      const { estimatedPickups, estimatedEventArrival } =
        await computePartyEstimates(members, event.locationId, event.time);

      return {
        partyId: party.id,
        stops: members.map((m) => ({
          userId: m.userId,
          estimatedTime:
            estimatedPickups.get(m.userId)?.toISOString() ?? null,
        })),
        estimatedEventArrival: estimatedEventArrival?.toISOString() ?? null,
      } satisfies PartyEstimate;
    })
  );

  return { solution, partyEstimates };
}
