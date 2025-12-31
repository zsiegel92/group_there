import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { teams, teamsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import { createInviteToken } from "@/lib/team-invite";

const inviteSchema = z.object({
  email: z.string().email(),
});

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/teams/[id]/invite - Send an invite to join the team (admin only)
export async function POST(request: NextRequest, props: Params) {
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

  const body = await request.json();
  const result = inviteSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { email } = result.data;

  // Get the team with its secret
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // The team.secret is already hashed in the DB
  // We need the unhashed secret to create the invite token
  // Since we don't store the unhashed secret, we'll need to modify our approach
  // Instead, we'll use the hashed secret as the salt (it's still a secret value)
  const inviteToken = createInviteToken({
    teamId,
    email,
    teamSecret: team.secret, // Using hashed secret as the salt
  });

  // Create the invite URL
  const baseUrl =
    process.env.VERCEL_URL ||
    process.env.PRODUCTION_URL ||
    "localhost:3000";
  const protocol = baseUrl.includes("localhost") ? "http" : "https";
  const inviteUrl = `${protocol}://${baseUrl}/teams/invite/accept?token=${inviteToken}`;

  // Send the invite email
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${team.name} on GROUPTHERE`,
    text: `You've been invited to join the team "${team.name}" on GROUPTHERE.\n\nClick the link below to accept the invitation:\n${inviteUrl}\n\nIf you don't have an account yet, you'll need to sign up first.`,
    html: `
      <h2>Team Invitation</h2>
      <p>You've been invited to join the team <strong>${team.name}</strong> on GROUPTHERE.</p>
      <p><a href="${inviteUrl}">Click here to accept the invitation</a></p>
      <p>If you don't have an account yet, you'll need to sign up first.</p>
    `,
  });

  return NextResponse.json({ success: true });
}
