import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { events, groupsToUsers, solutions } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/events/[id]/unlock - Unlock event and delete persisted solution
export async function POST(request: NextRequest, props: Params) {
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

  if (!event.locked) {
    return NextResponse.json(
      { error: "Event is not locked" },
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

  // Delete solution (cascade deletes parties + members), then unlock event
  await db.delete(solutions).where(eq(solutions.eventId, eventId));
  await db
    .update(events)
    .set({ locked: false })
    .where(eq(events.id, eventId));

  return NextResponse.json({ success: true });
}
