import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  blasts,
  eventKindValues,
  eventParticipationModeValues,
  events,
  externalRideshareModeValues,
  groupsToUsers,
  locationDistances,
  locations,
  solutions,
  type LocationOwnerType,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ensureDistancesForEvent } from "@/lib/geo/distances";
import { computePartyEstimates } from "@/lib/itinerary";

type Params = {
  params: Promise<{ id: string }>;
};

const updateEventSchema = z.object({
  eventSeriesId: z.string().min(1).nullable().optional(),
  kind: z.enum(eventKindValues).optional(),
  name: z.string().min(1).max(200).optional(),
  locationId: z.string().min(1).nullable().optional(),
  time: z.string().optional(),
  timeZone: z.string().min(1).optional(),
  participationMode: z.enum(eventParticipationModeValues).optional(),
  externalRideshareMode: z.enum(externalRideshareModeValues).optional(),
  externalRideshareSeats: z.number().int().min(1).max(5).optional(),
  externalRideshareCostMultiplier: z.number().min(1).optional(),
  externalRideshareFixedCostSeconds: z.number().min(0).optional(),
  message: z.string().max(2000).optional(),
});

// GET /api/events/[id] - Get event details with attendees
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  // Get event with group, location, and attendees
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      group: true,
      location: true,
      eventsToUsers: {
        with: {
          user: true,
          originLocation: true,
          destinationLocation: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check if user is a member of the event's group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Non-admins can only see scheduled events
  if (!event.scheduled && !membership.isAdmin) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Find current user's attendance
  const userAttendance = event.eventsToUsers.find(
    (att) => att.userId === user.id
  );

  // Query direct travel time from user's origin to event location
  let directTravelSeconds: number | null = null;
  const directDestinationLocationId =
    userAttendance?.destinationLocationId ?? event.locationId;
  if (
    userAttendance?.originLocationId &&
    directDestinationLocationId &&
    userAttendance.originLocationId !== directDestinationLocationId
  ) {
    const dist = await db.query.locationDistances.findFirst({
      where: and(
        eq(locationDistances.originLocationId, userAttendance.originLocationId),
        eq(locationDistances.destinationLocationId, directDestinationLocationId)
      ),
    });
    if (dist) {
      directTravelSeconds = dist.durationSeconds;
    }
  }

  const formatLocationObj = (loc: typeof event.location) =>
    loc
      ? {
          id: loc.id,
          googlePlaceId: loc.googlePlaceId,
          name: loc.name,
          addressString: loc.addressString,
          street1: loc.street1,
          street2: loc.street2,
          city: loc.city,
          state: loc.state,
          zip: loc.zip,
          latitude: loc.latitude,
          longitude: loc.longitude,
          ownerType: loc.ownerType,
          ownerId: loc.ownerId,
        }
      : null;

  // Load solution if event is locked
  let solutionData = null;
  let myParty = null;

  if (event.locked) {
    const sol = await db.query.solutions.findFirst({
      where: eq(solutions.eventId, eventId),
      with: {
        parties: {
          with: {
            driver: true,
            members: {
              with: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (sol) {
      // Build attendee lookup for origin locations and leave times
      const attendeeLookup = new Map(
        event.eventsToUsers.map((att) => [
          att.userId,
          {
            originLocation: formatLocationObj(att.originLocation),
            originLocationId: att.originLocationId,
            destinationLocation: formatLocationObj(att.destinationLocation),
            destinationLocationId: att.destinationLocationId,
            requiredArrivalTime: att.requiredArrivalTime
              ? att.requiredArrivalTime.toISOString()
              : null,
            earliestLeaveTime: att.earliestLeaveTime
              ? att.earliestLeaveTime.toISOString()
              : null,
          },
        ])
      );

      // Admin gets full solution with itinerary estimates
      if (membership.isAdmin) {
        const sortedParties = sol.parties.sort(
          (a, b) => a.partyIndex - b.partyIndex
        );

        // Compute itinerary estimates for all parties
        const partyEstimatesResults = await Promise.all(
          sortedParties.map(async (party) => {
            const sortedMembers = party.members.sort(
              (a, b) => a.pickupOrder - b.pickupOrder
            );
            const membersForEstimate = sortedMembers.map((m) => {
              const a = event.eventsToUsers.find((e) => e.userId === m.userId);
              return {
                userId: m.userId,
                originLocationId: a?.originLocationId ?? null,
                earliestLeaveTime: a?.earliestLeaveTime ?? null,
                pickupOrder: m.pickupOrder,
              };
            });
            return computePartyEstimates(
              membersForEstimate,
              event.locationId,
              event.time
            );
          })
        );

        solutionData = {
          id: sol.id,
          problemKind: sol.problemKind,
          feasible: sol.feasible,
          optimal: sol.optimal,
          totalDriveSeconds: sol.totalDriveSeconds,
          externalRideshareMode: sol.externalRideshareMode,
          externalRideshareVehicleCount: sol.externalRideshareVehicleCount,
          totalExternalRideshareCostSeconds:
            sol.totalExternalRideshareCostSeconds,
          parties: sortedParties.map((party, pi) => {
            const estimates = partyEstimatesResults[pi];
            return {
              id: party.id,
              partyIndex: party.partyIndex,
              driverUserId: party.driverUserId,
              vehicleKind: party.vehicleKind,
              externalRideshareOriginLocationId:
                party.externalRideshareOriginLocationId,
              externalRideshareLabel: party.externalRideshareLabel,
              costMultiplier: party.costMultiplier,
              driverName: party.driver?.name ?? null,
              estimatedEventArrival: estimates?.estimatedEventArrival
                ? estimates.estimatedEventArrival.toISOString()
                : null,
              members: party.members
                .sort((a, b) => a.pickupOrder - b.pickupOrder)
                .map((m) => {
                  const att = attendeeLookup.get(m.userId);
                  const pickup = estimates?.estimatedPickups.get(m.userId);
                  return {
                    userId: m.userId,
                    userName: m.user.name,
                    userEmail: m.user.email,
                    pickupOrder: m.pickupOrder,
                    originLocation: att?.originLocation ?? null,
                    originLocationId: att?.originLocationId ?? null,
                    earliestLeaveTime: att?.earliestLeaveTime ?? null,
                    estimatedPickup: pickup ? pickup.toISOString() : null,
                  };
                }),
            };
          }),
        };
      }

      // Everyone gets their party (with emails and estimated arrival times)
      for (const party of sol.parties) {
        const isMember = party.members.some((m) => m.userId === user.id);
        if (isMember) {
          const currentMember = party.members.find((m) => m.userId === user.id);
          const sortedMembers = party.members.sort(
            (a, b) => a.pickupOrder - b.pickupOrder
          );

          // Compute estimated times for this party
          const attendeeForEstimates = sortedMembers.map((m) => {
            const a = event.eventsToUsers.find((e) => e.userId === m.userId);
            return {
              userId: m.userId,
              originLocationId: a?.originLocationId ?? null,
              earliestLeaveTime: a?.earliestLeaveTime ?? null,
              pickupOrder: m.pickupOrder,
            };
          });

          const { estimatedPickups, estimatedEventArrival } =
            await computePartyEstimates(
              attendeeForEstimates,
              event.locationId,
              event.time
            );

          myParty = {
            role:
              currentMember?.pickupOrder === 0
                ? ("driver" as const)
                : ("passenger" as const),
            partyIndex: party.partyIndex,
            estimatedEventArrival: estimatedEventArrival
              ? estimatedEventArrival.toISOString()
              : null,
            members: sortedMembers.map((m) => {
              const memberAtt = attendeeLookup.get(m.userId);
              const pickup = estimatedPickups.get(m.userId);
              return {
                userId: m.userId,
                userName: m.user.name,
                userEmail: m.user.email,
                pickupOrder: m.pickupOrder,
                originLocation: memberAtt?.originLocation ?? null,
                originLocationId: memberAtt?.originLocationId ?? null,
                earliestLeaveTime: memberAtt?.earliestLeaveTime ?? null,
                estimatedPickup: pickup ? pickup.toISOString() : null,
              };
            }),
          };
          break;
        }
      }
    }
  }

  // Build attendees: admins get full list, non-admins get empty
  const attendees = membership.isAdmin
    ? event.eventsToUsers.map((att) => ({
        userId: att.user.id,
        userName: att.user.name,
        userEmail: att.user.email,
        userImage: att.user.image,
        userAttendance: {
          drivingStatus: att.drivingStatus,
          carFits: att.carFits,
          earliestLeaveTime: att.earliestLeaveTime
            ? att.earliestLeaveTime.toISOString()
            : null,
          originLocationId: att.originLocationId,
          originLocation: formatLocationObj(att.originLocation),
          destinationLocationId: att.destinationLocationId,
          destinationLocation: formatLocationObj(att.destinationLocation),
          requiredArrivalTime: att.requiredArrivalTime
            ? att.requiredArrivalTime.toISOString()
            : null,
          joinedAt: att.createdAt.toISOString(),
          directTravelSeconds: null,
        },
      }))
    : [];

  // Load blasts for admins
  const eventBlasts = membership.isAdmin
    ? await db.query.blasts.findMany({
        where: eq(blasts.eventId, eventId),
        orderBy: (blasts, { desc }) => [desc(blasts.createdAt)],
      })
    : [];

  return NextResponse.json({
    event: {
      id: event.id,
      groupId: event.groupId,
      groupName: event.group.name,
      eventSeriesId: event.eventSeriesId,
      kind: event.kind,
      name: event.name,
      locationId: event.locationId,
      location: formatLocationObj(event.location),
      time: event.time.toISOString(),
      timeZone: event.timeZone,
      participationMode: event.participationMode,
      externalRideshareMode: event.externalRideshareMode,
      externalRideshareSeats: event.externalRideshareSeats,
      externalRideshareCostMultiplier: event.externalRideshareCostMultiplier,
      externalRideshareFixedCostSeconds:
        event.externalRideshareFixedCostSeconds,
      message: event.message,
      scheduled: event.scheduled,
      locked: event.locked,
      createdAt: event.createdAt.toISOString(),
      isAdmin: membership.isAdmin,
      hasJoined: !!userAttendance,
      userAttendance: userAttendance
        ? {
            drivingStatus: userAttendance.drivingStatus,
            carFits: userAttendance.carFits,
            earliestLeaveTime: userAttendance.earliestLeaveTime
              ? userAttendance.earliestLeaveTime.toISOString()
              : null,
            originLocationId: userAttendance.originLocationId,
            originLocation: formatLocationObj(userAttendance.originLocation),
            destinationLocationId: userAttendance.destinationLocationId,
            destinationLocation: formatLocationObj(
              userAttendance.destinationLocation
            ),
            requiredArrivalTime: userAttendance.requiredArrivalTime
              ? userAttendance.requiredArrivalTime.toISOString()
              : null,
            joinedAt: userAttendance.createdAt.toISOString(),
            directTravelSeconds,
          }
        : null,
      attendees,
      attendeeCount: event.eventsToUsers.length,
      solution: solutionData,
      myParty,
      blasts: membership.isAdmin
        ? eventBlasts.map((b) => ({
            id: b.id,
            type: b.type,
            recipientCount: b.recipientCount,
            createdAt: b.createdAt.toISOString(),
          }))
        : [],
    },
  });
}

// PATCH /api/events/[id] - Update event (admin only)
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const body = await request.json();
  const result = updateEventSchema.safeParse(body);

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

  // Check if user is an admin of the event's group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (event.locked) {
    return NextResponse.json(
      { error: "Cannot edit a locked event. Unlock it first." },
      { status: 400 }
    );
  }

  // If updating locationId, verify the location exists and is an event location
  if (result.data.locationId) {
    const expectedOwnerType: LocationOwnerType = "event";
    const location = await db.query.locations.findFirst({
      where: and(
        eq(locations.id, result.data.locationId),
        eq(locations.ownerType, expectedOwnerType)
      ),
    });
    if (!location) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 400 }
      );
    }
  }

  // Update the event
  const updateData: Record<string, unknown> = {};
  if (result.data.eventSeriesId !== undefined)
    updateData.eventSeriesId = result.data.eventSeriesId;
  if (result.data.kind !== undefined) updateData.kind = result.data.kind;
  if (result.data.name !== undefined) updateData.name = result.data.name;
  if (result.data.locationId !== undefined)
    updateData.locationId = result.data.locationId;
  if (result.data.time !== undefined)
    updateData.time = new Date(result.data.time);
  if (result.data.timeZone !== undefined)
    updateData.timeZone = result.data.timeZone;
  if (result.data.participationMode !== undefined)
    updateData.participationMode = result.data.participationMode;
  if (result.data.externalRideshareMode !== undefined)
    updateData.externalRideshareMode = result.data.externalRideshareMode;
  if (result.data.externalRideshareSeats !== undefined)
    updateData.externalRideshareSeats = result.data.externalRideshareSeats;
  if (result.data.externalRideshareCostMultiplier !== undefined)
    updateData.externalRideshareCostMultiplier =
      result.data.externalRideshareCostMultiplier;
  if (result.data.externalRideshareFixedCostSeconds !== undefined)
    updateData.externalRideshareFixedCostSeconds =
      result.data.externalRideshareFixedCostSeconds;
  if (result.data.message !== undefined)
    updateData.message = result.data.message;

  const [updatedEvent] = await db
    .update(events)
    .set(updateData)
    .where(eq(events.id, eventId))
    .returning();

  if (result.data.locationId !== undefined) {
    after(async () => {
      await ensureDistancesForEvent(eventId);
    });
  }

  return NextResponse.json({
    event: {
      id: updatedEvent.id,
      groupId: updatedEvent.groupId,
      eventSeriesId: updatedEvent.eventSeriesId,
      kind: updatedEvent.kind,
      name: updatedEvent.name,
      locationId: updatedEvent.locationId,
      time: updatedEvent.time.toISOString(),
      timeZone: updatedEvent.timeZone,
      participationMode: updatedEvent.participationMode,
      externalRideshareMode: updatedEvent.externalRideshareMode,
      externalRideshareSeats: updatedEvent.externalRideshareSeats,
      externalRideshareCostMultiplier:
        updatedEvent.externalRideshareCostMultiplier,
      externalRideshareFixedCostSeconds:
        updatedEvent.externalRideshareFixedCostSeconds,
      message: updatedEvent.message,
      scheduled: updatedEvent.scheduled,
      updatedAt: updatedEvent.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/events/[id] - Delete event (admin only, only if unscheduled)
export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  // Get event
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check if user is an admin of the event's group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Can only delete unscheduled events
  if (event.scheduled) {
    return NextResponse.json(
      { error: "Cannot delete scheduled event. Unschedule it first." },
      { status: 400 }
    );
  }

  // Delete the event (cascade will delete eventsToUsers)
  await db.delete(events).where(eq(events.id, eventId));

  return NextResponse.json({ success: true });
}
