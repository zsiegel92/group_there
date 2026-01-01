import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { groups, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { verifyInviteToken } from "@/lib/group-invite";

// GET /api/groups/invite/accept?token=... - Accept a group invitation
export async function GET(request: NextRequest) {
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // First, try to find the group (we'll need to check all groups)
  // This is not ideal but necessary since we can't decrypt without the secret
  const allGroups = await db.query.groups.findMany();

  let groupId: string | null = null;
  let inviteEmail: string | null = null;

  for (const group of allGroups) {
    const result = verifyInviteToken({
      token,
      groupSecret: group.secret, // hashed secret
    });

    if (result && result.groupId === group.id) {
      groupId = result.groupId;
      inviteEmail = result.email;
      break;
    }
  }

  if (!groupId || !inviteEmail) {
    return NextResponse.json(
      { error: "Invalid or expired invite token" },
      { status: 400 }
    );
  }

  // Verify the logged-in user's email matches the invite email
  if (user.email !== inviteEmail) {
    return NextResponse.json(
      { error: "This invite is for a different email address" },
      { status: 403 }
    );
  }

  // Verify the group exists
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Check if user is already a member
  const existingMembership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (existingMembership) {
    return NextResponse.json(
      { error: "Already a member", groupId },
      { status: 200 }
    );
  }

  // Add the user to the group
  await db.insert(groupsToUsers).values({
    groupId,
    userId: user.id,
    isAdmin: false,
  });

  return NextResponse.json({
    success: true,
    groupId,
    groupName: group.name,
  });
}
