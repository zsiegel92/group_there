import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  events,
  eventsToUsers,
  groupsToUsers,
  locations,
  type LocationOwnerType,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ensureDistancesForEvent } from "@/lib/geo/distances";

type Params = {
  params: Promise<{ id: string }>;
};

const attendanceSchema = z
  .object({
    drivingStatus: z.enum(["cannot_drive", "must_drive", "can_drive_or_not"]),
    nonDriverSeats: z.number().int().min(0).max(5).nullable(),
    earliestLeaveTime: z.string().nullable(),
    originLocationId: z.string().min(1),
    destinationLocationId: z.string().min(1).nullable().optional(),
    requiredArrivalTime: z.string().nullable().optional(),
    joinedAt: z.string().optional(),
  })
  .refine(
    (data) => {
      // A driver may have zero non-driver seats.
      if (
        data.drivingStatus === "must_drive" ||
        data.drivingStatus === "can_drive_or_not"
      ) {
        return data.nonDriverSeats !== null && data.earliestLeaveTime !== null;
      }
      return true;
    },
    {
      message:
        "non-driver seat count and earliestLeaveTime are required when driving status is 'must_drive' or 'can_drive_or_not'",
    }
  )
  .refine(
    (data) => {
      // Non-drivers offer zero non-driver seats and have no driver leave time.
      if (data.drivingStatus === "cannot_drive") {
        return data.nonDriverSeats === 0 && data.earliestLeaveTime === null;
      }
      return true;
    },
    {
      message:
        "non-driver seat count should be 0 and earliestLeaveTime should be null when driving status is 'cannot_drive'",
    }
  );

function testingEventAttendanceResponse() {
  return NextResponse.json(
    {
      error:
        "Testing playground events manage riders through the testing rider tools",
    },
    { status: 403 }
  );
}

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
    with: {
      group: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.group.type === "testing") {
    return testingEventAttendanceResponse();
  }

  // Event must be scheduled for users to join
  if (!event.scheduled) {
    return NextResponse.json(
      { error: "Cannot join unscheduled event" },
      { status: 400 }
    );
  }

  if (event.locked) {
    return NextResponse.json(
      { error: "Cannot modify attendance for a locked event" },
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

  const {
    drivingStatus,
    nonDriverSeats,
    earliestLeaveTime,
    originLocationId,
    destinationLocationId,
    requiredArrivalTime,
  } = result.data;
  const normalizedDestinationLocationId =
    event.kind === "commute" ? (destinationLocationId ?? null) : null;
  const normalizedRequiredArrivalTime =
    event.kind === "commute"
      ? (requiredArrivalTime ?? event.time.toISOString())
      : null;

  if (event.kind === "commute" && !normalizedDestinationLocationId) {
    return NextResponse.json(
      { error: "Destination location is required for commute events" },
      { status: 400 }
    );
  }

  // Verify the location exists and is a user location
  const expectedOwnerType: LocationOwnerType = "user";
  const location = await db.query.locations.findFirst({
    where: and(
      eq(locations.id, originLocationId),
      eq(locations.ownerType, expectedOwnerType)
    ),
  });

  if (!location) {
    return NextResponse.json(
      { error: "Origin location not found" },
      { status: 400 }
    );
  }

  if (normalizedDestinationLocationId) {
    const destination = await db.query.locations.findFirst({
      where: eq(locations.id, normalizedDestinationLocationId),
    });

    if (!destination) {
      return NextResponse.json(
        { error: "Destination location not found" },
        { status: 400 }
      );
    }
  }

  // Validate earliestLeaveTime is not after event time
  if (earliestLeaveTime) {
    const leaveTime = new Date(earliestLeaveTime);
    const arrivalTime = normalizedRequiredArrivalTime
      ? new Date(normalizedRequiredArrivalTime)
      : event.time;
    if (leaveTime >= arrivalTime) {
      return NextResponse.json(
        {
          error: "Earliest leave time must be before the required arrival time",
        },
        { status: 400 }
      );
    }
  }

  // After validation, this is always a non-driver seat count.
  const nonDriverSeatsValue = nonDriverSeats ?? 0;

  // Create attendance record
  await db.insert(eventsToUsers).values({
    eventId,
    userId: user.id,
    drivingStatus,
    nonDriverSeats: nonDriverSeatsValue,
    earliestLeaveTime: earliestLeaveTime ? new Date(earliestLeaveTime) : null,
    originLocationId,
    destinationLocationId: normalizedDestinationLocationId,
    requiredArrivalTime: normalizedRequiredArrivalTime
      ? new Date(normalizedRequiredArrivalTime)
      : null,
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
      nonDriverSeats: nonDriverSeatsValue,
      earliestLeaveTime: earliestLeaveTime ?? null,
      originLocationId,
      destinationLocationId: normalizedDestinationLocationId,
      requiredArrivalTime: normalizedRequiredArrivalTime,
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
    with: {
      group: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.group.type === "testing") {
    return testingEventAttendanceResponse();
  }

  if (event.locked) {
    return NextResponse.json(
      { error: "Cannot modify attendance for a locked event" },
      { status: 400 }
    );
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

  const {
    drivingStatus,
    nonDriverSeats,
    earliestLeaveTime,
    originLocationId,
    destinationLocationId,
    requiredArrivalTime,
  } = result.data;
  const normalizedDestinationLocationId =
    event.kind === "commute" ? (destinationLocationId ?? null) : null;
  const normalizedRequiredArrivalTime =
    event.kind === "commute"
      ? (requiredArrivalTime ?? event.time.toISOString())
      : null;

  if (event.kind === "commute" && !normalizedDestinationLocationId) {
    return NextResponse.json(
      { error: "Destination location is required for commute events" },
      { status: 400 }
    );
  }

  // Verify the location exists and is a user location
  const expectedOwnerType: LocationOwnerType = "user";
  const location = await db.query.locations.findFirst({
    where: and(
      eq(locations.id, originLocationId),
      eq(locations.ownerType, expectedOwnerType)
    ),
  });

  if (!location) {
    return NextResponse.json(
      { error: "Origin location not found" },
      { status: 400 }
    );
  }

  if (normalizedDestinationLocationId) {
    const destination = await db.query.locations.findFirst({
      where: eq(locations.id, normalizedDestinationLocationId),
    });

    if (!destination) {
      return NextResponse.json(
        { error: "Destination location not found" },
        { status: 400 }
      );
    }
  }

  // Validate earliestLeaveTime is not after event time
  if (earliestLeaveTime) {
    const leaveTime = new Date(earliestLeaveTime);
    const arrivalTime = normalizedRequiredArrivalTime
      ? new Date(normalizedRequiredArrivalTime)
      : event.time;
    if (leaveTime >= arrivalTime) {
      return NextResponse.json(
        {
          error: "Earliest leave time must be before the required arrival time",
        },
        { status: 400 }
      );
    }
  }

  // After validation, this is always a non-driver seat count.
  const nonDriverSeatsValue = nonDriverSeats ?? 0;

  // Update attendance record
  await db
    .update(eventsToUsers)
    .set({
      drivingStatus,
      nonDriverSeats: nonDriverSeatsValue,
      earliestLeaveTime: earliestLeaveTime ? new Date(earliestLeaveTime) : null,
      originLocationId,
      destinationLocationId: normalizedDestinationLocationId,
      requiredArrivalTime: normalizedRequiredArrivalTime
        ? new Date(normalizedRequiredArrivalTime)
        : null,
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
      nonDriverSeats: nonDriverSeatsValue,
      earliestLeaveTime: earliestLeaveTime || null,
      originLocationId,
      destinationLocationId: normalizedDestinationLocationId,
      requiredArrivalTime: normalizedRequiredArrivalTime,
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

  // Check if event is locked
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      group: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.group.type === "testing") {
    return testingEventAttendanceResponse();
  }

  if (event.locked) {
    return NextResponse.json(
      { error: "Cannot modify attendance for a locked event" },
      { status: 400 }
    );
  }

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
