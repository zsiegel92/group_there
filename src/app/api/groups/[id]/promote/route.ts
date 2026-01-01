import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

const promoteSchema = z.object({
  userId: z.string(),
});

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/groups/[id]/promote - Promote a user to admin (admin only)
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = params.id;

  // Check if requester is an admin of this group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const result = promoteSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { userId } = result.data;

  // Check if the target user is a member
  const targetMembership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, groupId),
      eq(groupsToUsers.userId, userId)
    ),
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "User not a member" }, { status: 404 });
  }

  // Promote the user to admin
  await db
    .update(groupsToUsers)
    .set({ isAdmin: true })
    .where(
      and(eq(groupsToUsers.groupId, groupId), eq(groupsToUsers.userId, userId))
    );

  return NextResponse.json({ success: true });
}
