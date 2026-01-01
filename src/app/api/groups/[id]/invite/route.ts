import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { groups, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { createInviteToken } from "@/lib/group-invite";
import { sendEmail } from "@/lib/resend";

const inviteSchema = z.object({
  email: z.string().email(),
});

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/groups/[id]/invite - Send an invite to join the group (admin only)
export async function POST(request: NextRequest, props: Params) {
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

  const body = await request.json();
  const result = inviteSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { email } = result.data;

  // Get the group with its secret
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // The group.secret is already hashed in the DB
  // We need the unhashed secret to create the invite token
  // Since we don't store the unhashed secret, we'll need to modify our approach
  // Instead, we'll use the hashed secret as the salt (it's still a secret value)
  const inviteToken = createInviteToken({
    groupId,
    email,
    groupSecret: group.secret, // Using hashed secret as the salt
  });

  // Create the invite URL
  let baseUrl =
    process.env.VERCEL_URL || process.env.PRODUCTION_URL || "localhost:3000";
  // Strip any existing protocol from baseUrl
  baseUrl = baseUrl.replace(/^https?:\/\//, "");
  const protocol = baseUrl.includes("localhost") ? "http" : "https";
  const inviteUrl = `${protocol}://${baseUrl}/groups/invite/accept?token=${inviteToken}`;

  // Send the invite email
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${group.name} on GROUPTHERE`,
    text: `You've been invited to join the group "${group.name}" on GROUPTHERE.\n\nClick the link below to accept the invitation:\n${inviteUrl}\n\nIf you don't have an account yet, you'll need to sign up first.`,
    html: `
      <h2>Group Invitation</h2>
      <p>You've been invited to join the group <strong>${group.name}</strong> on GROUPTHERE.</p>
      <p><a href="${inviteUrl}">Click here to accept the invitation</a></p>
      <p>If you don't have an account yet, you'll need to sign up first.</p>
    `,
  });

  return NextResponse.json({ success: true });
}
