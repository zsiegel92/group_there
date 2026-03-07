import { and, eq, inArray, or } from "drizzle-orm";
import PQueue from "p-queue";
import pRetry from "p-retry";

import { db } from "@/db/db";
import { events, locationDistances, locations } from "@/db/schema";

import { googleComputeRoute, googleRouteMatrix } from "./service";

const POLYLINE_CONCURRENCY = 3;
const POLYLINE_INTERVAL_MS = 200;
const POLYLINE_RETRY_COUNT = 2;

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

/**
 * Ensure encoded polylines exist for a set of location pairs.
 * Returns all polylines keyed by `${originId}:${destId}`.
 */
export async function ensurePolylinesForPairs(
  pairs: { originLocationId: string; destinationLocationId: string }[]
) {
  if (pairs.length === 0) return {};

  const allLocationIds = [
    ...new Set(
      pairs.flatMap((p) => [p.originLocationId, p.destinationLocationId])
    ),
  ];

  // Fetch existing distance rows for these pairs
  const existing = await db
    .select({
      originLocationId: locationDistances.originLocationId,
      destinationLocationId: locationDistances.destinationLocationId,
      encodedPolyline: locationDistances.encodedPolyline,
    })
    .from(locationDistances)
    .where(
      and(
        inArray(locationDistances.originLocationId, allLocationIds),
        inArray(locationDistances.destinationLocationId, allLocationIds)
      )
    );

  const result: Record<string, string | null> = {};
  const missingPairs: {
    originLocationId: string;
    destinationLocationId: string;
  }[] = [];

  for (const pair of pairs) {
    const key = `${pair.originLocationId}:${pair.destinationLocationId}`;
    const row = existing.find(
      (e) => `${e.originLocationId}:${e.destinationLocationId}` === key
    );
    if (row?.encodedPolyline) {
      result[key] = row.encodedPolyline;
    } else {
      missingPairs.push(pair);
    }
  }

  if (missingPairs.length === 0) return result;

  // Look up lat/lng for locations that need polyline fetching
  const missingLocationIds = [
    ...new Set(
      missingPairs.flatMap((p) => [p.originLocationId, p.destinationLocationId])
    ),
  ];
  const locRows = await db
    .select({
      id: locations.id,
      latitude: locations.latitude,
      longitude: locations.longitude,
    })
    .from(locations)
    .where(inArray(locations.id, missingLocationIds));

  const locMap = new Map(locRows.map((l) => [l.id, l]));

  const queue = new PQueue({
    concurrency: POLYLINE_CONCURRENCY,
    interval: POLYLINE_INTERVAL_MS,
    intervalCap: POLYLINE_CONCURRENCY,
  });

  const tasks = missingPairs.map((pair) =>
    queue.add(async () => {
      const origin = locMap.get(pair.originLocationId);
      const dest = locMap.get(pair.destinationLocationId);
      if (!origin || !dest) return;

      const originLat = origin.latitude;
      const originLng = origin.longitude;
      const destLat = dest.latitude;
      const destLng = dest.longitude;
      if (
        originLat == null ||
        originLng == null ||
        destLat == null ||
        destLng == null
      ) {
        return;
      }

      const key = `${pair.originLocationId}:${pair.destinationLocationId}`;
      try {
        const { encodedPolyline } = await pRetry(
          () =>
            googleComputeRoute(
              { latitude: originLat, longitude: originLng },
              { latitude: destLat, longitude: destLng }
            ),
          { retries: POLYLINE_RETRY_COUNT }
        );

        // Update the existing distance row with the polyline
        await db
          .update(locationDistances)
          .set({ encodedPolyline })
          .where(
            and(
              eq(locationDistances.originLocationId, pair.originLocationId),
              eq(
                locationDistances.destinationLocationId,
                pair.destinationLocationId
              )
            )
          );

        result[key] = encodedPolyline;
      } catch (err) {
        console.error(`Failed to fetch polyline for ${key}:`, err);
        result[key] = null;
      }
    })
  );

  await Promise.all(tasks);

  return result;
}
