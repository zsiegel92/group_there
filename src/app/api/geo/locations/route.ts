import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { locationOwnerTypeValues, locations } from "@/db/schema";
import { getUser } from "@/lib/auth";

const createLocationSchema = z.object({
  googlePlaceId: z.string().nullable(),
  name: z.string().min(1),
  addressString: z.string().min(1),
  street1: z.string().nullable(),
  street2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  ownerType: z.enum(locationOwnerTypeValues),
  ownerId: z.string().min(1),
});

type LocationRecord = typeof locations.$inferSelect;
type CreateLocationInput = z.infer<typeof createLocationSchema>;

function serializeLocation(loc: LocationRecord) {
  return {
    id: loc.id,
    googlePlaceId: loc.googlePlaceId,
    name: loc.name,
    addressString: loc.addressString,
    street1: loc.street1,
    street2: loc.street2,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    latitude: loc.latitude,
    longitude: loc.longitude,
    ownerType: loc.ownerType,
    ownerId: loc.ownerId,
  };
}

async function findExistingLocation(input: CreateLocationInput) {
  const ownerPredicate = and(
    eq(locations.ownerType, input.ownerType),
    eq(locations.ownerId, input.ownerId)
  );

  const identityPredicate = input.googlePlaceId
    ? eq(locations.googlePlaceId, input.googlePlaceId)
    : eq(locations.addressString, input.addressString);

  const [existing] = await db
    .select()
    .from(locations)
    .where(and(ownerPredicate, identityPredicate))
    .orderBy(asc(locations.createdAt), asc(locations.id))
    .limit(1);

  return existing ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerTypeParam = request.nextUrl.searchParams.get("ownerType");
  const ownerId = request.nextUrl.searchParams.get("ownerId");

  if (!ownerTypeParam || !ownerId) {
    return NextResponse.json(
      { error: "ownerType and ownerId are required" },
      { status: 400 }
    );
  }

  const ownerTypeParsed = z
    .enum(locationOwnerTypeValues)
    .safeParse(ownerTypeParam);
  if (!ownerTypeParsed.success) {
    return NextResponse.json({ error: "Invalid ownerType" }, { status: 400 });
  }

  const ownerType = ownerTypeParsed.data;

  const results = await db
    .select()
    .from(locations)
    .where(
      and(eq(locations.ownerType, ownerType), eq(locations.ownerId, ownerId))
    )
    .orderBy(desc(locations.createdAt));

  return NextResponse.json({
    locations: results.map(serializeLocation),
  });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = createLocationSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const existing = await findExistingLocation(result.data);
  if (existing) {
    return NextResponse.json({
      location: serializeLocation(existing),
    });
  }

  const [created] = await db
    .insert(locations)
    .values({
      id: `loc_${crypto.randomUUID()}`,
      ...result.data,
    })
    .onConflictDoNothing({
      target: [locations.ownerType, locations.ownerId, locations.googlePlaceId],
    })
    .returning();

  if (!created) {
    const concurrentlyCreated = await findExistingLocation(result.data);
    if (concurrentlyCreated) {
      return NextResponse.json({
        location: serializeLocation(concurrentlyCreated),
      });
    }

    return NextResponse.json(
      { error: "Failed to create location" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    location: serializeLocation(created),
  });
}
