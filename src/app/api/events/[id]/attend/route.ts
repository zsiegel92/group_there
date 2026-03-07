import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { events, eventsToUsers, groupsToUsers, locations } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ensureDistancesForEvent } from "@/lib/geo/distances";

type Params = {
  params: Promise<{ id: string }>;
};

const attendanceSchema = z
  .object({
    drivingStatus: z.enum(["cannot_drive", "must_drive", "can_drive_or_not"]),
    carFits: z.number().int().min(0).nullable(),
    earliestLeaveTime: z.string().nullable(),
    originLocationId: z.string().min(1),
    joinedAt: z.string().optional(),
  })
  .refine(
    (data) => {
      // If driving, must provide carFits and earliest leave time
      if (
        data.drivingStatus === "must_drive" ||
        data.drivingStatus === "can_drive_or_not"
      ) {
        return (
          data.carFits !== null &&
          data.carFits > 0 &&
          data.earliestLeaveTime !== null
        );
      }
      return true;
    },
    {
      message:
        "carFits and earliestLeaveTime are required when driving status is 'must_drive' or 'can_drive_or_not'",
    }
  )
  .refine(
    (data) => {
      // If cannot drive, carFits should be 0 and earliestLeaveTime should be null
      if (data.drivingStatus === "cannot_drive") {
        return data.carFits === 0 && data.earliestLeaveTime === null;
      }
      return true;
    },
    {
      message:
        "carFits should be 0 and earliestLeaveTime should be null when driving status is 'cannot_drive'",
    }
  );

// POST /api/events/[id]/attend - Join event with attendance details
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const body = await request.json();
  const result = attendanceSchema.safeParse(body);

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

  // Event must be scheduled for users to join
  if (!event.scheduled) {
    return NextResponse.json(
      { error: "Cannot join unscheduled event" },
      { status: 400 }
    );
  }

  // Check if user is a member of the event's group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Must be a member of the group to join event" },
      { status: 403 }
    );
  }

  // Check if user already joined
  const existingAttendance = await db.query.eventsToUsers.findFirst({
    where: and(
      eq(eventsToUsers.eventId, eventId),
      eq(eventsToUsers.userId, user.id)
    ),
  });

  if (existingAttendance) {
    return NextResponse.json(
      { error: "Already joined this event" },
      { status: 400 }
    );
  }

  const { drivingStatus, carFits, earliestLeaveTime, originLocationId } =
    result.data;

  // Verify the location exists
  const location = await db.query.locations.findFirst({
    where: eq(locations.id, originLocationId),
  });

  if (!location) {
    return NextResponse.json(
      { error: "Origin location not found" },
      { status: 400 }
    );
  }

  // Validate earliestLeaveTime is not after event time
  if (earliestLeaveTime) {
    const leaveTime = new Date(earliestLeaveTime);
    if (leaveTime >= event.time) {
      return NextResponse.json(
        {
          error: "Earliest leave time must be before the event start time",
        },
        { status: 400 }
      );
    }
  }

  // After validation, carFits is always a number (0 for cannot_drive, >0 for others)
  const carFitsValue = carFits ?? 0;

  // Create attendance record
  await db.insert(eventsToUsers).values({
    eventId,
    userId: user.id,
    drivingStatus,
    carFits: carFitsValue,
    earliestLeaveTime: earliestLeaveTime ? new Date(earliestLeaveTime) : null,
    originLocationId,
  });

  after(async () => {
    await ensureDistancesForEvent(eventId);
  });

  return NextResponse.json({
    success: true,
    attendance: {
      eventId,
      userId: user.id,
      drivingStatus,
      carFits,
      earliestLeaveTime: earliestLeaveTime ?? null,
      originLocationId,
    },
  });
}

// PATCH /api/events/[id]/attend - Update attendance details
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const body = await request.json();
  const result = attendanceSchema.safeParse(body);

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

  // Check if user already joined
  const existingAttendance = await db.query.eventsToUsers.findFirst({
    where: and(
      eq(eventsToUsers.eventId, eventId),
      eq(eventsToUsers.userId, user.id)
    ),
  });

  if (!existingAttendance) {
    return NextResponse.json(
      { error: "Not joined this event yet" },
      { status: 400 }
    );
  }

  const { drivingStatus, carFits, earliestLeaveTime, originLocationId } =
    result.data;

  // Verify the location exists
  const location = await db.query.locations.findFirst({
    where: eq(locations.id, originLocationId),
  });

  if (!location) {
    return NextResponse.json(
      { error: "Origin location not found" },
      { status: 400 }
    );
  }

  // Validate earliestLeaveTime is not after event time
  if (earliestLeaveTime) {
    const leaveTime = new Date(earliestLeaveTime);
    if (leaveTime >= event.time) {
      return NextResponse.json(
        {
          error: "Earliest leave time must be before the event start time",
        },
        { status: 400 }
      );
    }
  }

  // After validation, carFits is always a number (0 for cannot_drive, >0 for others)
  const carFitsValue = carFits ?? 0;

  // Update attendance record
  await db
    .update(eventsToUsers)
    .set({
      drivingStatus,
      carFits: carFitsValue,
      earliestLeaveTime: earliestLeaveTime ? new Date(earliestLeaveTime) : null,
      originLocationId,
    })
    .where(
      and(eq(eventsToUsers.eventId, eventId), eq(eventsToUsers.userId, user.id))
    );

  after(async () => {
    await ensureDistancesForEvent(eventId);
  });

  return NextResponse.json({
    success: true,
    attendance: {
      eventId,
      userId: user.id,
      drivingStatus,
      carFits,
      earliestLeaveTime: earliestLeaveTime || null,
      originLocationId,
    },
  });
}

// DELETE /api/events/[id]/attend - Leave event (remove attendance)
export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  // Check if user is attending
  const existingAttendance = await db.query.eventsToUsers.findFirst({
    where: and(
      eq(eventsToUsers.eventId, eventId),
      eq(eventsToUsers.userId, user.id)
    ),
  });

  if (!existingAttendance) {
    return NextResponse.json(
      { error: "Not attending this event" },
      { status: 400 }
    );
  }

  // Remove attendance record
  await db
    .delete(eventsToUsers)
    .where(
      and(eq(eventsToUsers.eventId, eventId), eq(eventsToUsers.userId, user.id))
    );

  return NextResponse.json({
    success: true,
  });
}
