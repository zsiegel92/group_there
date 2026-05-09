import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  drivingStatusEnumValues,
  events,
  eventsToUsers,
  groupsToUsers,
  locationDistances,
  locations,
  users,
} from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

async function verifyTestingEventAdmin(request: NextRequest, eventId: string) {
  const user = await getUser(request);
  if (!user) return null;

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: { group: true },
  });

  if (!event || event.group.type !== "testing") return null;

  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership?.isAdmin) return null;
  return { user, event };
}

// GET /api/testing-events/[id]/riders - List all riders for this testing event
export async function GET(request: NextRequest, props: Params) {
  const { id: eventId } = await props.params;
  const verified = await verifyTestingEventAdmin(request, eventId);
  if (!verified) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const attendees = await db.query.eventsToUsers.findMany({
    where: eq(eventsToUsers.eventId, eventId),
    orderBy: [asc(eventsToUsers.createdAt), asc(eventsToUsers.userId)],
    with: {
      user: true,
      originLocation: true,
      destinationLocation: true,
    },
  });

  // Look up direct travel times from each rider's origin to their effective destination.
  const locationIds = [
    ...new Set(
      attendees.flatMap((a) => {
        const ids: string[] = [];
        if (a.originLocationId) ids.push(a.originLocationId);
        const destinationLocationId =
          a.destinationLocationId ?? verified.event.locationId;
        if (destinationLocationId) ids.push(destinationLocationId);
        return ids;
      })
    ),
  ];

  const distanceMap = new Map<string, number>();
  if (locationIds.length > 1) {
    const distances = await db
      .select({
        originLocationId: locationDistances.originLocationId,
        destinationLocationId: locationDistances.destinationLocationId,
        durationSeconds: locationDistances.durationSeconds,
      })
      .from(locationDistances)
      .where(
        and(
          inArray(locationDistances.originLocationId, locationIds),
          inArray(locationDistances.destinationLocationId, locationIds)
        )
      );
    for (const d of distances) {
      distanceMap.set(
        `${d.originLocationId}:${d.destinationLocationId}`,
        d.durationSeconds
      );
    }
  }

  return NextResponse.json({
    riders: attendees.map((a) => ({
      userId: a.userId,
      userName: a.user.name,
      userEmail: a.user.email,
      isTestUser: a.user.isTestUser,
      drivingStatus: a.drivingStatus,
      nonDriverSeats: a.nonDriverSeats,
      earliestLeaveTime: a.earliestLeaveTime?.toISOString() ?? null,
      originLocationId: a.originLocationId,
      originLocation: a.originLocation
        ? {
            id: a.originLocation.id,
            name: a.originLocation.name,
            addressString: a.originLocation.addressString,
            latitude: a.originLocation.latitude,
            longitude: a.originLocation.longitude,
          }
        : null,
      destinationLocationId: a.destinationLocationId,
      destinationLocation: a.destinationLocation
        ? {
            id: a.destinationLocation.id,
            name: a.destinationLocation.name,
            addressString: a.destinationLocation.addressString,
            latitude: a.destinationLocation.latitude,
            longitude: a.destinationLocation.longitude,
          }
        : null,
      requiredArrivalTime: a.requiredArrivalTime?.toISOString() ?? null,
      directTravelSeconds:
        a.originLocationId &&
        (a.destinationLocationId ?? verified.event.locationId)
          ? (distanceMap.get(
              `${a.originLocationId}:${a.destinationLocationId ?? verified.event.locationId}`
            ) ?? null)
          : null,
    })),
  });
}

const bulkUpdateSchema = z.object({
  updates: z.array(
    z.object({
      userId: z.string(),
      drivingStatus: z.enum(drivingStatusEnumValues).optional(),
      nonDriverSeats: z.number().int().min(0).max(5).optional(),
      earliestLeaveTime: z.string().nullable().optional(),
    })
  ),
});

// PATCH /api/testing-events/[id]/riders - Bulk update rider attributes
export async function PATCH(request: NextRequest, props: Params) {
  const { id: eventId } = await props.params;
  const verified = await verifyTestingEventAdmin(request, eventId);
  if (!verified) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const result = bulkUpdateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  for (const update of result.data.updates) {
    const setValues: Partial<typeof eventsToUsers.$inferInsert> = {};
    if (update.drivingStatus !== undefined)
      setValues.drivingStatus = update.drivingStatus;
    if (update.nonDriverSeats !== undefined)
      setValues.nonDriverSeats = update.nonDriverSeats;
    if (update.earliestLeaveTime !== undefined)
      setValues.earliestLeaveTime = update.earliestLeaveTime
        ? new Date(update.earliestLeaveTime)
        : null;

    if (Object.keys(setValues).length > 0) {
      await db
        .update(eventsToUsers)
        .set(setValues)
        .where(
          and(
            eq(eventsToUsers.eventId, eventId),
            eq(eventsToUsers.userId, update.userId)
          )
        );
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/testing-events/[id]/riders?userId=X or ?all=true
export async function DELETE(request: NextRequest, props: Params) {
  const { id: eventId } = await props.params;
  const verified = await verifyTestingEventAdmin(request, eventId);
  if (!verified) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const deleteAll = request.nextUrl.searchParams.get("all") === "true";
  const userId = request.nextUrl.searchParams.get("userId");

  if (deleteAll) {
    // Get all test user attendees
    const attendees = await db.query.eventsToUsers.findMany({
      where: eq(eventsToUsers.eventId, eventId),
      with: { user: true },
    });

    const testUserIds = attendees
      .filter((a) => a.user.isTestUser)
      .map((a) => a.userId);

    if (testUserIds.length > 0) {
      // Delete eventsToUsers (cascade from user deletion handles this, but be explicit)
      await db
        .delete(eventsToUsers)
        .where(
          and(
            eq(eventsToUsers.eventId, eventId),
            inArray(eventsToUsers.userId, testUserIds)
          )
        );

      // Delete groupsToUsers for test users in this group
      await db
        .delete(groupsToUsers)
        .where(
          and(
            eq(groupsToUsers.groupId, verified.event.groupId),
            inArray(groupsToUsers.userId, testUserIds)
          )
        );

      // Delete locations owned by test users
      for (const uid of testUserIds) {
        await db
          .delete(locations)
          .where(
            and(eq(locations.ownerType, "user"), eq(locations.ownerId, uid))
          );
      }

      // Delete the test users themselves
      await db.delete(users).where(inArray(users.id, testUserIds));
    }

    return NextResponse.json({
      success: true,
      deletedCount: testUserIds.length,
    });
  }

  if (userId) {
    // Verify the user is a test user
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!targetUser?.isTestUser) {
      return NextResponse.json(
        { error: "Can only delete test users" },
        { status: 400 }
      );
    }

    await db
      .delete(eventsToUsers)
      .where(
        and(
          eq(eventsToUsers.eventId, eventId),
          eq(eventsToUsers.userId, userId)
        )
      );

    await db
      .delete(groupsToUsers)
      .where(
        and(
          eq(groupsToUsers.groupId, verified.event.groupId),
          eq(groupsToUsers.userId, userId)
        )
      );

    await db
      .delete(locations)
      .where(
        and(eq(locations.ownerType, "user"), eq(locations.ownerId, userId))
      );

    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Must specify userId or all=true" },
    { status: 400 }
  );
}
