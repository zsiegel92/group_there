import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { groups, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/groups/[id] - Get group details with members
export async function GET(request: NextRequest, props: Params) {
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
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get group with all members
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    with: {
      groupsToUsers: {
        with: {
          user: true,
        },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json({
    group: {
      group: {
        id: group.id,
        name: group.name,
        type: group.type,
        createdAt: group.createdAt,
      },
      members: group.groupsToUsers.map((gu) => ({
        user: {
          id: gu.user.id,
          name: gu.user.name,
          email: gu.user.email,
          image: gu.user.image,
          isTestUser: gu.user.isTestUser,
        },
        isAdmin: gu.isAdmin,
        joinedAt: gu.createdAt,
      })),
    },
  });
}

// DELETE /api/groups/[id] - Delete a group (admin only)
export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = params.id;

  // Check if user is an admin of this group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete the group (cascade will delete groupsToUsers)
  await db.delete(groups).where(eq(groups.id, groupId));

  return NextResponse.json({ success: true });
}
