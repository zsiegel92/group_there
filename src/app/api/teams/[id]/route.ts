import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { teams, teamsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/teams/[id] - Get team details with members
export async function GET(request: NextRequest, props: Params) {
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
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get team with all members
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: {
      teamsToUsers: {
        with: {
          user: true,
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      isAdmin: membership.isAdmin,
      members: team.teamsToUsers.map((tu) => ({
        id: tu.user.id,
        name: tu.user.name,
        email: tu.user.email,
        image: tu.user.image,
        isAdmin: tu.isAdmin,
        joinedAt: tu.createdAt,
      })),
    },
  });
}

// DELETE /api/teams/[id] - Delete a team (admin only)
export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = params.id;

  // Check if user is an admin of this team
  const membership = await db.query.teamsToUsers.findFirst({
    where: and(
      eq(teamsToUsers.teamId, teamId),
      eq(teamsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete the team (cascade will delete teamsToUsers)
  await db.delete(teams).where(eq(teams.id, teamId));

  return NextResponse.json({ success: true });
}
