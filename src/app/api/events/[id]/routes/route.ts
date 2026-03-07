import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { events, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ensurePolylinesForPairs } from "@/lib/geo/distances";

type Params = {
  params: Promise<{ id: string }>;
};

const requestBodySchema = z.object({
  pairs: z.array(
    z.object({
      originLocationId: z.string(),
      destinationLocationId: z.string(),
    })
  ),
});

// POST /api/events/[id]/routes - Fetch polylines for location pairs
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

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await request.json();
  const result = requestBodySchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const polylines = await ensurePolylinesForPairs(result.data.pairs);

  return NextResponse.json({ polylines });
}
