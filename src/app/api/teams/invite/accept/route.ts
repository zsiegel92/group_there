import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { teams, teamsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { verifyInviteToken } from "@/lib/team-invite";

// GET /api/teams/invite/accept?token=... - Accept a team invitation
export async function GET(request: NextRequest) {
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // First, try to find the team (we'll need to check all teams)
  // This is not ideal but necessary since we can't decrypt without the secret
  const allTeams = await db.query.teams.findMany();

  let teamId: string | null = null;
  let inviteEmail: string | null = null;

  for (const team of allTeams) {
    const result = verifyInviteToken({
      token,
      teamSecret: team.secret, // hashed secret
    });

    if (result && result.teamId === team.id) {
      teamId = result.teamId;
      inviteEmail = result.email;
      break;
    }
  }

  if (!teamId || !inviteEmail) {
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

  // Verify the team exists
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Check if user is already a member
  const existingMembership = await db.query.teamsToUsers.findFirst({
    where: and(
      eq(teamsToUsers.teamId, teamId),
      eq(teamsToUsers.userId, user.id)
    ),
  });

  if (existingMembership) {
    return NextResponse.json(
      { error: "Already a member", teamId },
      { status: 200 }
    );
  }

  // Add the user to the team
  await db.insert(teamsToUsers).values({
    teamId,
    userId: user.id,
    isAdmin: false,
  });

  return NextResponse.json({
    success: true,
    teamId,
    teamName: team.name,
  });
}
