import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import { locations } from "@/db/schema";
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
  ownerType: z.enum(["user", "event"]),
  ownerId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerType = request.nextUrl.searchParams.get("ownerType");
  const ownerId = request.nextUrl.searchParams.get("ownerId");

  if (!ownerType || !ownerId) {
    return NextResponse.json(
      { error: "ownerType and ownerId are required" },
      { status: 400 },
    );
  }

  const results = await db
    .select()
    .from(locations)
    .where(
      and(eq(locations.ownerType, ownerType), eq(locations.ownerId, ownerId)),
    )
    .orderBy(desc(locations.createdAt));

  return NextResponse.json({
    locations: results.map((loc) => ({
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
    })),
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

  const locationId = `loc_${crypto.randomUUID()}`;

  const [created] = await db
    .insert(locations)
    .values({
      id: locationId,
      ...result.data,
    })
    .returning();

  return NextResponse.json({
    location: {
      id: created.id,
      googlePlaceId: created.googlePlaceId,
      name: created.name,
      addressString: created.addressString,
      street1: created.street1,
      street2: created.street2,
      city: created.city,
      state: created.state,
      zip: created.zip,
      latitude: created.latitude,
      longitude: created.longitude,
      ownerType: created.ownerType,
      ownerId: created.ownerId,
    },
  });
}
