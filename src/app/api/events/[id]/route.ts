import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { events, groupsToUsers, locations } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ensureDistancesForEvent } from "@/lib/geo/distances";

type Params = {
  params: Promise<{ id: string }>;
};

const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  locationId: z.string().min(1).optional(),
  time: z.string().optional(),
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

  return NextResponse.json({
    event: {
      id: event.id,
      groupId: event.groupId,
      groupName: event.group.name,
      name: event.name,
      locationId: event.locationId,
      location: formatLocationObj(event.location),
      time: event.time.toISOString(),
      message: event.message,
      scheduled: event.scheduled,
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
            joinedAt: userAttendance.createdAt.toISOString(),
          }
        : null,
      attendees: event.eventsToUsers.map((att) => ({
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
          joinedAt: att.createdAt.toISOString(),
        },
      })),
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

  // If updating locationId, verify the location exists
  if (result.data.locationId !== undefined) {
    const location = await db.query.locations.findFirst({
      where: eq(locations.id, result.data.locationId),
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
  if (result.data.name !== undefined) updateData.name = result.data.name;
  if (result.data.locationId !== undefined)
    updateData.locationId = result.data.locationId;
  if (result.data.time !== undefined)
    updateData.time = new Date(result.data.time);
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
      name: updatedEvent.name,
      locationId: updatedEvent.locationId,
      time: updatedEvent.time.toISOString(),
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
