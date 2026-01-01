import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { events, eventsToUsers, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

const attendanceSchema = z
  .object({
    drivingStatus: z.enum(["cannot_drive", "must_drive", "can_drive_or_not"]),
    passengersCount: z.number().int().min(1).optional(),
    earliestLeaveTime: z.string().optional(),
    originLocation: z.string().min(1).max(500),
  })
  .refine(
    (data) => {
      // If driving, must provide passengers count and earliest leave time
      if (
        data.drivingStatus === "must_drive" ||
        data.drivingStatus === "can_drive_or_not"
      ) {
        return (
          data.passengersCount !== undefined &&
          data.earliestLeaveTime !== undefined
        );
      }
      return true;
    },
    {
      message:
        "passengersCount and earliestLeaveTime are required when driving status is 'must_drive' or 'can_drive_or_not'",
    }
  )
  .refine(
    (data) => {
      // If cannot drive, should not provide passengers count or earliest leave time
      if (data.drivingStatus === "cannot_drive") {
        return (
          data.passengersCount === undefined &&
          data.earliestLeaveTime === undefined
        );
      }
      return true;
    },
    {
      message:
        "passengersCount and earliestLeaveTime should not be provided when driving status is 'cannot_drive'",
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

  const { drivingStatus, passengersCount, earliestLeaveTime, originLocation } =
    result.data;

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

  // Create attendance record
  await db.insert(eventsToUsers).values({
    eventId,
    userId: user.id,
    drivingStatus,
    passengersCount: passengersCount || null,
    earliestLeaveTime: earliestLeaveTime ? new Date(earliestLeaveTime) : null,
    originLocation,
  });

  return NextResponse.json({
    success: true,
    attendance: {
      eventId,
      userId: user.id,
      drivingStatus,
      passengersCount: passengersCount || null,
      earliestLeaveTime: earliestLeaveTime || null,
      originLocation,
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

  const { drivingStatus, passengersCount, earliestLeaveTime, originLocation } =
    result.data;

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

  // Update attendance record
  await db
    .update(eventsToUsers)
    .set({
      drivingStatus,
      passengersCount: passengersCount || null,
      earliestLeaveTime: earliestLeaveTime ? new Date(earliestLeaveTime) : null,
      originLocation,
    })
    .where(
      and(eq(eventsToUsers.eventId, eventId), eq(eventsToUsers.userId, user.id))
    );

  return NextResponse.json({
    success: true,
    attendance: {
      eventId,
      userId: user.id,
      drivingStatus,
      passengersCount: passengersCount || null,
      earliestLeaveTime: earliestLeaveTime || null,
      originLocation,
    },
  });
}
