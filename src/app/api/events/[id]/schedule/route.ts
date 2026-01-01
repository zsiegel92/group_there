import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { events, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/events/[id]/schedule - Schedule event (admin only)
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

  // Check if already scheduled
  if (event.scheduled) {
    return NextResponse.json(
      { error: "Event is already scheduled" },
      { status: 400 }
    );
  }

  // Schedule the event
  // Note: if haveSentInvitationEmails is false, this is the first time scheduling
  // and emails should be sent (to be implemented later)
  const [updatedEvent] = await db
    .update(events)
    .set({
      scheduled: true,
      haveSentInvitationEmails: true, // Set to true even though emails aren't sent yet
    })
    .where(eq(events.id, eventId))
    .returning();

  return NextResponse.json({
    success: true,
    event: {
      id: updatedEvent.id,
      scheduled: updatedEvent.scheduled,
      haveSentInvitationEmails: updatedEvent.haveSentInvitationEmails,
    },
  });
}
