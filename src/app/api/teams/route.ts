import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { teams, teamsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { generateTeamSecret, hashTeamSecret } from "@/lib/team-invite";

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

// GET /api/teams - Get all teams for the current user
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userTeams = await db.query.teamsToUsers.findMany({
    where: eq(teamsToUsers.userId, user.id),
    with: {
      team: true,
    },
  });

  return NextResponse.json({
    teams: userTeams.map((ut) => ({
      id: ut.team.id,
      name: ut.team.name,
      isAdmin: ut.isAdmin,
      createdAt: ut.team.createdAt,
    })),
  });
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const result = createTeamSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { name } = result.data;

  // Generate a team secret and hash it
  const teamSecret = generateTeamSecret();
  const hashedSecret = hashTeamSecret(teamSecret);

  // Create the team with a unique ID
  const teamId = `team_${crypto.randomUUID()}`;

  const [createdTeam] = await db
    .insert(teams)
    .values({
      id: teamId,
      name,
      secret: hashedSecret,
    })
    .returning();

  // Add the creator as an admin
  await db.insert(teamsToUsers).values({
    teamId,
    userId: user.id,
    isAdmin: true,
  });

  return NextResponse.json({
    team: {
      id: createdTeam.id,
      name: createdTeam.name,
      isAdmin: true,
      createdAt: createdTeam.createdAt,
    },
  });
}
