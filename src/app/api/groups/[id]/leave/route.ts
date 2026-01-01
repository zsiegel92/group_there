import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/db";
import { groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/groups/[id]/leave - Leave a group
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = params.id;

  // Check if user is a member of this group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }
  if (membership.isAdmin) {
    const existsOtherAdmin = await db.query.groupsToUsers.findFirst({
      where: and(
        eq(groupsToUsers.groupId, groupId),
        ne(groupsToUsers.userId, user.id),
        eq(groupsToUsers.isAdmin, true)
      ),
    });
    if (!existsOtherAdmin) {
      return NextResponse.json(
        { error: "Cannot leave group with no other admins" },
        { status: 403 }
      );
    }
  }
  // Remove the user from the group
  await db
    .delete(groupsToUsers)
    .where(
      and(eq(groupsToUsers.groupId, groupId), eq(groupsToUsers.userId, user.id))
    );

  return NextResponse.json({ success: true });
}
