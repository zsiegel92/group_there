import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/db";
import { events, locationDistances } from "@/db/schema";

import { googleRouteMatrix } from "./service";

/**
 * Gather all location IDs relevant to an event's distance matrix:
 * the event's own location + all attendees' origin locations.
 * Only includes locations that have lat/lon.
 */
async function getEventLocationIds(eventId: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      location: true,
      eventsToUsers: {
        with: { originLocation: true },
      },
    },
  });

  if (!event) throw new Error(`Event ${eventId} not found`);

  const locationMap = new Map<
    string,
    { id: string; latitude: number; longitude: number }
  >();

  if (event.location?.latitude != null && event.location?.longitude != null) {
    locationMap.set(event.location.id, {
      id: event.location.id,
      latitude: event.location.latitude,
      longitude: event.location.longitude,
    });
  }

  for (const att of event.eventsToUsers) {
    const loc = att.originLocation;
    if (loc?.latitude != null && loc?.longitude != null) {
      locationMap.set(loc.id, {
        id: loc.id,
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    }
  }

  return locationMap;
}

/**
 * For an event, figure out which pairwise distances are needed vs. already stored,
 * and return the status.
 */
export async function getDistanceStatus(eventId: string) {
  const locationMap = await getEventLocationIds(eventId);
  const locationIds = [...locationMap.keys()];

  if (locationIds.length < 2) {
    return { complete: true, have: 0, need: 0 };
  }

  // Total needed: n*(n-1) ordered pairs
  const need = locationIds.length * (locationIds.length - 1);

  // Count existing distances for these location pairs
  const existing = await db
    .select()
    .from(locationDistances)
    .where(
      and(
        inArray(locationDistances.originLocationId, locationIds),
        inArray(locationDistances.destinationLocationId, locationIds)
      )
    );

  // Filter to only pairs where origin != destination (self-pairs shouldn't exist but be safe)
  const have = existing.filter(
    (d) => d.originLocationId !== d.destinationLocationId
  ).length;

  return { complete: have >= need, have, need };
}

/**
 * Ensure all pairwise distances exist in the database for an event.
 * Fetches only missing pairs from the Google Routes Matrix API.
 */
export async function ensureDistancesForEvent(eventId: string) {
  const locationMap = await getEventLocationIds(eventId);
  const locs = [...locationMap.values()];

  if (locs.length < 2) return;

  const locationIds = locs.map((l) => l.id);

  // Find which pairs already exist
  const existing = await db
    .select({
      originLocationId: locationDistances.originLocationId,
      destinationLocationId: locationDistances.destinationLocationId,
    })
    .from(locationDistances)
    .where(
      and(
        inArray(locationDistances.originLocationId, locationIds),
        inArray(locationDistances.destinationLocationId, locationIds)
      )
    );

  const existingSet = new Set(
    existing.map((d) => `${d.originLocationId}:${d.destinationLocationId}`)
  );

  // Figure out which pairs are missing
  const missingPairLocIds = new Set<string>();
  for (const a of locs) {
    for (const b of locs) {
      if (a.id !== b.id && !existingSet.has(`${a.id}:${b.id}`)) {
        missingPairLocIds.add(a.id);
        missingPairLocIds.add(b.id);
      }
    }
  }

  if (missingPairLocIds.size === 0) return;

  // Only send locations involved in missing pairs to the API
  const locsToQuery = locs.filter((l) => missingPairLocIds.has(l.id));

  const results = await googleRouteMatrix(locsToQuery);

  // Filter to only actually missing pairs (the API returns full matrix for queried locations)
  const toInsert = results.filter(
    (r) => !existingSet.has(`${r.originLocationId}:${r.destinationLocationId}`)
  );

  if (toInsert.length === 0) return;

  // Upsert — on conflict do nothing since existing data is fine
  await db.insert(locationDistances).values(toInsert).onConflictDoNothing();
}

/**
 * Delete all cached distances involving a specific location.
 * Call this when a location's lat/lon changes.
 */
export async function invalidateDistancesForLocation(locationId: string) {
  await db
    .delete(locationDistances)
    .where(
      or(
        eq(locationDistances.originLocationId, locationId),
        eq(locationDistances.destinationLocationId, locationId)
      )
    );
}
