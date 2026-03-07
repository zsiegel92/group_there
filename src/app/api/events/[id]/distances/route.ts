import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { events, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import {
  ensureDistancesForEvent,
  getDistanceStatus,
} from "@/lib/geo/distances";

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/events/[id]/distances - Check distance matrix completeness
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const status = await getDistanceStatus(eventId);
  return NextResponse.json(status);
}

// POST /api/events/[id]/distances - Re-trigger distance calculation (admin only)
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
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

  after(async () => {
    await ensureDistancesForEvent(eventId);
  });

  return NextResponse.json({ triggered: true });
}
