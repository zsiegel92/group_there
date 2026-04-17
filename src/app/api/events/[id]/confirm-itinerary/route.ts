import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  eventKindValues,
  events,
  eventsToUsers,
  externalRideshareModeValues,
  groupsToUsers,
  solutionParties,
  solutionPartyMembers,
  solutions,
  solutionVehicleKindValues,
} from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

const partySchema = z.object({
  driverUserId: z.string().nullable(),
  passengerUserIds: z.array(z.string()),
  vehicleKind: z
    .enum(solutionVehicleKindValues)
    .optional()
    .default("participant_vehicle"),
  externalRideshareOriginLocationId: z.string().nullable().optional(),
  externalRideshareLabel: z.string().nullable().optional(),
  costMultiplier: z.number().min(1).optional().default(1),
});

const confirmItinerarySchema = z.object({
  parties: z.array(partySchema),
  problemKind: z.enum(eventKindValues).optional().default("shared_destination"),
  externalRideshareMode: z
    .enum(externalRideshareModeValues)
    .optional()
    .default("disabled"),
  externalRideshareVehicleCount: z.number().int().min(0).optional().default(0),
  totalExternalRideshareCostSeconds: z.number().min(0).optional().default(0),
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
    if (party.vehicleKind === "participant_vehicle" && !party.driverUserId) {
      return NextResponse.json(
        { error: "Participant vehicles require a driver" },
        { status: 400 }
      );
    }
    if (party.driverUserId && !attendeeUserIds.has(party.driverUserId)) {
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
    problemKind: result.data.problemKind,
    feasible: result.data.feasible,
    optimal: result.data.optimal,
    totalDriveSeconds: result.data.totalDriveSeconds,
    externalRideshareMode: result.data.externalRideshareMode,
    externalRideshareVehicleCount: result.data.externalRideshareVehicleCount,
    totalExternalRideshareCostSeconds:
      result.data.totalExternalRideshareCostSeconds,
  });

  // Insert parties and members
  for (let i = 0; i < result.data.parties.length; i++) {
    const party = result.data.parties[i]!;
    const partyId = `pty_${crypto.randomUUID()}`;

    await db.insert(solutionParties).values({
      id: partyId,
      solutionId,
      driverUserId: party.driverUserId,
      vehicleKind: party.vehicleKind,
      externalRideshareOriginLocationId:
        party.externalRideshareOriginLocationId ?? null,
      externalRideshareLabel: party.externalRideshareLabel ?? null,
      costMultiplier: party.costMultiplier,
      partyIndex: i,
    });

    // Driver at pickupOrder 0, passengers at pickupOrder 1+
    // Filter out the driver from passengers to avoid PK violation
    const passengerIds = party.driverUserId
      ? party.passengerUserIds.filter((id) => id !== party.driverUserId)
      : party.passengerUserIds;
    const memberRows = [
      ...(party.driverUserId
        ? [{ partyId, userId: party.driverUserId, pickupOrder: 0 }]
        : []),
      ...passengerIds.map((passId, j) => ({
        partyId,
        userId: passId,
        pickupOrder: party.driverUserId ? j + 1 : j,
      })),
    ];
    if (memberRows.length > 0) {
      await db.insert(solutionPartyMembers).values(memberRows);
    }
  }

  // Lock the event
  await db.update(events).set({ locked: true }).where(eq(events.id, eventId));

  return NextResponse.json({ success: true });
}
