import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { groups, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { generateGroupSecret, hashGroupSecret } from "@/lib/group-invite";

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
});

// GET /api/groups - Get all groups for the current user
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userGroups = await db.query.groupsToUsers.findMany({
    where: eq(groupsToUsers.userId, user.id),
    with: {
      group: {
        with: {
          groupsToUsers: true,
        },
      },
    },
  });

  return NextResponse.json({
    groups: userGroups.map((ug) => ({
      group: {
        id: ug.group.id,
        name: ug.group.name,
        type: ug.group.type,
        createdAt: ug.group.createdAt,
      },
      isAdmin: ug.isAdmin,
      memberCount: ug.group.groupsToUsers.length,
    })),
  });
}

// POST /api/groups - Create a new group
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const result = createGroupSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { name } = result.data;

  // Generate a group secret and hash it
  const groupSecret = generateGroupSecret();
  const hashedSecret = hashGroupSecret(groupSecret);

  // Create the group with a unique ID
  const groupId = `group_${crypto.randomUUID()}`;

  const [createdGroup] = await db
    .insert(groups)
    .values({
      id: groupId,
      name,
      secret: hashedSecret,
    })
    .returning();

  // Add the creator as an admin
  await db.insert(groupsToUsers).values({
    groupId,
    userId: user.id,
    isAdmin: true,
  });

  return NextResponse.json({
    group: {
      id: createdGroup.id,
      name: createdGroup.name,
      createdAt: createdGroup.createdAt,
    },
  });
}
