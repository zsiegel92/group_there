import { after, NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  events,
  eventsToUsers,
  groupsToUsers,
  locations,
  users,
  type DrivingStatus,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ensureDistancesForEvent } from "@/lib/geo/distances";
import { randomPointInRadius } from "@/lib/geo/random-points";
import { googleReverseGeocode } from "@/lib/geo/service";

type Params = {
  params: Promise<{ id: string }>;
};

const generateRidersSchema = z.object({
  count: z.number().int().min(1).max(50),
  radiusMiles: z.number().min(0.5).max(100),
  centerLocationId: z.string().min(1).optional(),
});

const FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Taylor",
  "Morgan",
  "Casey",
  "Riley",
  "Jamie",
  "Quinn",
  "Avery",
  "Skyler",
  "Drew",
  "Sam",
  "Charlie",
  "Hayden",
  "Emery",
  "Peyton",
  "Reese",
  "Finley",
  "Sage",
  "Rowan",
  "Blake",
  "Dakota",
  "Parker",
  "Cameron",
  "Dylan",
];

const LAST_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]!;
  const lastInitial =
    LAST_INITIALS[Math.floor(Math.random() * LAST_INITIALS.length)]!;
  return `${first} ${lastInitial}.`;
}

function randomDrivingStatus(): DrivingStatus {
  const r = Math.random();
  if (r < 0.3) return "cannot_drive";
  if (r < 0.6) return "must_drive";
  return "can_drive_or_not";
}

function randomCarFits(status: DrivingStatus) {
  if (status === "cannot_drive") return 0;
  return Math.floor(Math.random() * 4) + 2; // 2-5 non-driver seats
}

const DEPARTURE_OFFSETS_MINUTES = [15, 30, 45, 60, 75, 90, 120];

function randomEarliestLeaveTime(
  eventTime: Date,
  status: DrivingStatus
): Date | null {
  if (status === "cannot_drive") return null;
  const offset =
    DEPARTURE_OFFSETS_MINUTES[
      Math.floor(Math.random() * DEPARTURE_OFFSETS_MINUTES.length)
    ]!;
  return new Date(eventTime.getTime() - offset * 60 * 1000);
}

export async function POST(request: NextRequest, props: Params) {
  const { id: eventId } = await props.params;
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: { group: true, location: true },
  });

  if (!event || event.group.type !== "testing") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership?.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const result = generateRidersSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { count, radiusMiles, centerLocationId } = result.data;
  const centerLocation =
    event.kind === "commute" && centerLocationId
      ? await db.query.locations.findFirst({
          where: eq(locations.id, centerLocationId),
        })
      : event.location;

  if (
    !centerLocation ||
    centerLocation.latitude == null ||
    centerLocation.longitude == null
  ) {
    return NextResponse.json(
      {
        error:
          event.kind === "commute"
            ? "Choose a generation center with coordinates for commute riders"
            : "Event must have a location with coordinates",
      },
      { status: 400 }
    );
  }

  const centerLat = centerLocation.latitude;
  const centerLng = centerLocation.longitude;

  const generatedRiders: { userId: string; name: string }[] = [];

  for (let i = 0; i < count; i++) {
    const originPoint = randomPointInRadius(centerLat, centerLng, radiusMiles);
    const destinationPoint =
      event.kind === "commute"
        ? randomPointInRadius(centerLat, centerLng, radiusMiles)
        : null;

    let originDetails;
    let destinationDetails;
    try {
      originDetails = await googleReverseGeocode(
        originPoint.latitude,
        originPoint.longitude
      );
      if (destinationPoint) {
        destinationDetails = await googleReverseGeocode(
          destinationPoint.latitude,
          destinationPoint.longitude
        );
      }
    } catch (err) {
      console.error(`Reverse geocode failed for point ${i}:`, err);
      continue;
    }

    // Create test user
    const testUserId = `test_${crypto.randomUUID()}`;
    const name = randomName();

    await db.insert(users).values({
      id: testUserId,
      name,
      email: `${testUserId}@test.groupthere.local`,
      emailVerified: true,
      isTestUser: true,
    });

    // Create location
    const locationId = `loc_${crypto.randomUUID()}`;
    await db.insert(locations).values({
      id: locationId,
      googlePlaceId: originDetails.placeId,
      name: originDetails.name,
      addressString: originDetails.formattedAddress,
      street1: originDetails.street1,
      street2: originDetails.street2,
      city: originDetails.city,
      state: originDetails.state,
      zip: originDetails.zip,
      latitude: originDetails.latitude,
      longitude: originDetails.longitude,
      ownerType: "user",
      ownerId: testUserId,
    });

    let destinationLocationId: string | null = null;
    if (destinationDetails) {
      destinationLocationId = `loc_${crypto.randomUUID()}`;
      await db.insert(locations).values({
        id: destinationLocationId,
        googlePlaceId: destinationDetails.placeId,
        name: destinationDetails.name,
        addressString: destinationDetails.formattedAddress,
        street1: destinationDetails.street1,
        street2: destinationDetails.street2,
        city: destinationDetails.city,
        state: destinationDetails.state,
        zip: destinationDetails.zip,
        latitude: destinationDetails.latitude,
        longitude: destinationDetails.longitude,
        ownerType: "user",
        ownerId: testUserId,
      });
    }

    // Create eventsToUsers with random attendance
    const drivingStatus = randomDrivingStatus();
    const carFits = randomCarFits(drivingStatus);
    const earliestLeaveTime = randomEarliestLeaveTime(
      event.time,
      drivingStatus
    );

    await db.insert(eventsToUsers).values({
      eventId,
      userId: testUserId,
      drivingStatus,
      carFits,
      earliestLeaveTime,
      originLocationId: locationId,
      destinationLocationId,
      requiredArrivalTime: event.kind === "commute" ? event.time : null,
    });

    // Add to group
    await db.insert(groupsToUsers).values({
      groupId: event.groupId,
      userId: testUserId,
      isAdmin: false,
    });

    generatedRiders.push({ userId: testUserId, name });
  }

  // Trigger distance calculation in background
  after(async () => {
    await ensureDistancesForEvent(eventId);
  });

  return NextResponse.json({
    success: true,
    generatedCount: generatedRiders.length,
    riders: generatedRiders,
  });
}
