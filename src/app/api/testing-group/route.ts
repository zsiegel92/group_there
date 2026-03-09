import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/db";
import { groups, groupsToUsers } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { generateGroupSecret, hashGroupSecret } from "@/lib/group-invite";

// GET /api/testing-group - Get the current user's testing group (or null)
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allMemberships = await db.query.groupsToUsers.findMany({
    where: eq(groupsToUsers.userId, user.id),
    with: {
      group: true,
    },
  });

  const testingMembership = allMemberships.find(
    (m) => m.group.type === "testing"
  );

  if (!testingMembership) {
    return NextResponse.json({ testingGroup: null });
  }

  return NextResponse.json({
    testingGroup: {
      id: testingMembership.group.id,
      name: testingMembership.group.name,
      createdAt: testingMembership.group.createdAt,
    },
  });
}

// POST /api/testing-group - Create a testing group for the current user
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user already has a testing group
  const allMemberships = await db.query.groupsToUsers.findMany({
    where: eq(groupsToUsers.userId, user.id),
    with: {
      group: true,
    },
  });

  const existing = allMemberships.find((m) => m.group.type === "testing");
  if (existing) {
    return NextResponse.json({
      testingGroup: {
        id: existing.group.id,
        name: existing.group.name,
        createdAt: existing.group.createdAt,
      },
    });
  }

  const groupId = `group_${crypto.randomUUID()}`;
  const groupSecret = generateGroupSecret();
  const hashedSecret = hashGroupSecret(groupSecret);

  const [createdGroup] = await db
    .insert(groups)
    .values({
      id: groupId,
      name: "Testing Playground",
      secret: hashedSecret,
      type: "testing",
    })
    .returning();

  await db.insert(groupsToUsers).values({
    groupId,
    userId: user.id,
    isAdmin: true,
  });

  return NextResponse.json({
    testingGroup: {
      id: createdGroup.id,
      name: createdGroup.name,
      createdAt: createdGroup.createdAt,
    },
  });
}
