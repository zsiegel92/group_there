import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { events, groups, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import {
  addRecurrenceInterval,
  recurrenceFrequencyValues,
  recurrenceRule,
} from "@/lib/events/recurrence";

type Params = {
  params: Promise<{ id: string }>;
};

const extendSeriesSchema = z.object({
  frequency: z.enum(recurrenceFrequencyValues).default("weekly"),
  count: z.number().int().min(1).max(52),
});

export async function POST(request: NextRequest, props: Params) {
  const { id: eventId } = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = extendSeriesSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event?.eventSeriesId) {
    return NextResponse.json(
      { error: "Event is not part of a recurring series" },
      { status: 400 }
    );
  }

  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership?.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, event.groupId),
  });

  const seriesEvents = await db.query.events.findMany({
    where: eq(events.eventSeriesId, event.eventSeriesId),
  });

  const latestEvent = seriesEvents.toSorted(
    (a, b) => b.time.getTime() - a.time.getTime()
  )[0];

  if (!latestEvent) {
    return NextResponse.json(
      { error: "Series has no events to extend from" },
      { status: 400 }
    );
  }

  const { frequency, count } = result.data;
  const rule = recurrenceRule({ frequency, count });
  const eventRows = Array.from({ length: count }, (_, index) => ({
    id: `event_${crypto.randomUUID()}`,
    groupId: latestEvent.groupId,
    eventSeriesId: latestEvent.eventSeriesId,
    kind: latestEvent.kind,
    name: latestEvent.name,
    locationId: latestEvent.locationId,
    time: addRecurrenceInterval(latestEvent.time, frequency, index + 1),
    timeZone: latestEvent.timeZone,
    participationMode: latestEvent.participationMode,
    externalRideshareMode: latestEvent.externalRideshareMode,
    externalRideshareSeats: latestEvent.externalRideshareSeats,
    externalRideshareCostMultiplier:
      latestEvent.externalRideshareCostMultiplier,
    externalRideshareFixedCostSeconds:
      latestEvent.externalRideshareFixedCostSeconds,
    message: latestEvent.message,
    scheduled: group?.type === "testing" ? true : false,
    haveSentInvitationEmails: false,
  }));

  const createdEvents = await db.insert(events).values(eventRows).returning();

  return NextResponse.json({
    success: true,
    recurrenceRule: rule,
    events: createdEvents.map((createdEvent) => ({
      id: createdEvent.id,
      eventSeriesId: createdEvent.eventSeriesId,
      name: createdEvent.name,
      time: createdEvent.time.toISOString(),
      scheduled: createdEvent.scheduled,
    })),
  });
}
