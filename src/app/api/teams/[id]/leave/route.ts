import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/db";
import { teamsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/teams/[id]/leave - Leave a team
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = params.id;

  // Check if user is a member of this team
  const membership = await db.query.teamsToUsers.findFirst({
    where: and(
      eq(teamsToUsers.teamId, teamId),
      eq(teamsToUsers.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }
  if (membership.isAdmin) {
    const existsOtherAdmin = await db.query.teamsToUsers.findFirst({
      where: and(
        eq(teamsToUsers.teamId, teamId),
        ne(teamsToUsers.userId, user.id),
        eq(teamsToUsers.isAdmin, true)
      ),
    });
    if (!existsOtherAdmin) {
      return NextResponse.json(
        { error: "Cannot leave team with no other admins" },
        { status: 403 }
      );
    }
  }
  // Remove the user from the team
  await db
    .delete(teamsToUsers)
    .where(
      and(eq(teamsToUsers.teamId, teamId), eq(teamsToUsers.userId, user.id))
    );

  return NextResponse.json({ success: true });
}
