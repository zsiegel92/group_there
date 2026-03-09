import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  events,
  groups,
  groupsToUsers,
  locations,
  type LocationOwnerType,
} from "@/db/schema";
import { getUser } from "@/lib/auth";

const createEventSchema = z.object({
  groupId: z.string(),
  name: z.string().min(1).max(200),
  locationId: z.string().min(1),
  time: z.string(),
  message: z.string().max(2000).optional(),
});

// GET /api/events - Get all events for groups the current user is in
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = request.nextUrl.searchParams.get("groupId");

  // Get all groups the user is in (optionally filtered to one group)
  const userGroups = await db.query.groupsToUsers.findMany({
    where: groupId
      ? and(
          eq(groupsToUsers.userId, user.id),
          eq(groupsToUsers.groupId, groupId)
        )
      : eq(groupsToUsers.userId, user.id),
    with: {
      group: {
        with: {
          events: {
            with: {
              location: true,
              eventsToUsers: true,
            },
          },
        },
      },
    },
  });

  // Flatten and denormalize the data
  const denormalizedEvents = userGroups.flatMap((ug) => {
    const isGroupAdmin = ug.isAdmin;
    return ug.group.events
      .filter((event) => {
        // Only show scheduled events to non-admins
        return isGroupAdmin || event.scheduled;
      })
      .map((event) => ({
        group: {
          id: ug.group.id,
          name: ug.group.name,
          type: ug.group.type,
        },
        eventDetails: {
          id: event.id,
          name: event.name,
          locationId: event.locationId,
          location: event.location
            ? {
                id: event.location.id,
                name: event.location.name,
                addressString: event.location.addressString,
                city: event.location.city,
                state: event.location.state,
              }
            : null,
          time: event.time.toISOString(),
          message: event.message,
          scheduled: event.scheduled,
          locked: event.locked,
          createdAt: event.createdAt.toISOString(),
        },
        attendeeCount: event.eventsToUsers.length,
        hasJoined: event.eventsToUsers.some((etu) => etu.userId === user.id),
        isGroupAdmin,
      }));
  });

  return NextResponse.json({
    events: denormalizedEvents,
  });
}

// POST /api/events - Create a new event (admin only)
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = createEventSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { groupId, name, locationId, time, message } = result.data;

  // Check if user is admin of the group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Look up group to check type
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  // Verify the location exists and is an event location
  const expectedOwnerType: LocationOwnerType = "event";
  const location = await db.query.locations.findFirst({
    where: and(
      eq(locations.id, locationId),
      eq(locations.ownerType, expectedOwnerType)
    ),
  });

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 400 });
  }

  // Create the event with a unique ID
  const eventId = `event_${crypto.randomUUID()}`;

  const [createdEvent] = await db
    .insert(events)
    .values({
      id: eventId,
      groupId,
      name,
      locationId,
      time: new Date(time),
      message: message || null,
      scheduled: group?.type === "testing" ? true : false,
      haveSentInvitationEmails: false,
    })
    .returning();

  return NextResponse.json({
    event: {
      id: createdEvent.id,
      groupId: createdEvent.groupId,
      name: createdEvent.name,
      locationId: createdEvent.locationId,
      time: createdEvent.time.toISOString(),
      message: createdEvent.message,
      scheduled: createdEvent.scheduled,
      createdAt: createdEvent.createdAt.toISOString(),
    },
  });
}
