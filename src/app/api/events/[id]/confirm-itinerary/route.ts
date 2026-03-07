import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  events,
  eventsToUsers,
  groupsToUsers,
  solutionParties,
  solutionPartyMembers,
  solutions,
} from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

const partySchema = z.object({
  driverUserId: z.string(),
  passengerUserIds: z.array(z.string()),
});

const confirmItinerarySchema = z.object({
  parties: z.array(partySchema),
  totalDriveSeconds: z.number(),
  feasible: z.boolean(),
  optimal: z.boolean(),
});

// POST /api/events/[id]/confirm-itinerary - Lock event with a persisted solution
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const body = await request.json();
  const result = confirmItinerarySchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  // Get event
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Must be scheduled and not locked
  if (!event.scheduled) {
    return NextResponse.json(
      { error: "Event must be scheduled first" },
      { status: 400 }
    );
  }

  if (event.locked) {
    return NextResponse.json(
      { error: "Event is already locked. Unlock it first." },
      { status: 400 }
    );
  }

  // Check admin
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Validate all userIds are actual attendees
  const attendees = await db.query.eventsToUsers.findMany({
    where: eq(eventsToUsers.eventId, eventId),
  });
  const attendeeUserIds = new Set(attendees.map((a) => a.userId));

  for (const party of result.data.parties) {
    if (!attendeeUserIds.has(party.driverUserId)) {
      return NextResponse.json(
        { error: `Driver ${party.driverUserId} is not an attendee` },
        { status: 400 }
      );
    }
    for (const passId of party.passengerUserIds) {
      if (!attendeeUserIds.has(passId)) {
        return NextResponse.json(
          { error: `Passenger ${passId} is not an attendee` },
          { status: 400 }
        );
      }
    }
  }

  // Delete any existing solution (cascade deletes parties + members)
  await db.delete(solutions).where(eq(solutions.eventId, eventId));

  // Insert solution
  const solutionId = `sol_${crypto.randomUUID()}`;
  await db.insert(solutions).values({
    id: solutionId,
    eventId,
    feasible: result.data.feasible,
    optimal: result.data.optimal,
    totalDriveSeconds: result.data.totalDriveSeconds,
  });

  // Insert parties and members
  for (let i = 0; i < result.data.parties.length; i++) {
    const party = result.data.parties[i]!;
    const partyId = `pty_${crypto.randomUUID()}`;

    await db.insert(solutionParties).values({
      id: partyId,
      solutionId,
      driverUserId: party.driverUserId,
      partyIndex: i,
    });

    // Driver at pickupOrder 0, passengers at pickupOrder 1+
    const memberRows = [
      { partyId, userId: party.driverUserId, pickupOrder: 0 },
      ...party.passengerUserIds.map((passId, j) => ({
        partyId,
        userId: passId,
        pickupOrder: j + 1,
      })),
    ];
    await db.insert(solutionPartyMembers).values(memberRows);
  }

  // Lock the event
  await db.update(events).set({ locked: true }).where(eq(events.id, eventId));

  return NextResponse.json({ success: true });
}
