import { addSeconds } from "date-fns";
import { and, inArray } from "drizzle-orm";

import { db } from "@/db/db";
import { locationDistances } from "@/db/schema";

/**
 * Given a party's members (sorted by pickupOrder) and the event's locationId,
 * compute estimated pickup times for each stop and the final arrival at the event.
 *
 * Returns { estimatedPickups: Map<userId, Date>, estimatedEventArrival: Date | null }
 */
export async function computePartyEstimates(
  members: {
    userId: string;
    originLocationId: string | null;
    earliestLeaveTime: Date | null;
    pickupOrder: number;
  }[],
  eventLocationId: string | null
) {
  const sorted = [...members].sort((a, b) => a.pickupOrder - b.pickupOrder);

  // Build the route: driver origin → passenger origins → event location
  const routeLocationIds: string[] = [];
  for (const m of sorted) {
    if (m.originLocationId) routeLocationIds.push(m.originLocationId);
  }
  if (eventLocationId) routeLocationIds.push(eventLocationId);

  if (routeLocationIds.length < 2) {
    return {
      estimatedPickups: new Map<string, Date>(),
      estimatedEventArrival: null,
    };
  }

  // Build consecutive pairs
  const pairs: [string, string][] = [];
  for (let i = 0; i < routeLocationIds.length - 1; i++) {
    const origin = routeLocationIds[i]!;
    const dest = routeLocationIds[i + 1]!;
    pairs.push([origin, dest]);
  }

  // Query all distances we need
  const allLocIds = [...new Set(routeLocationIds)];
  const distances = await db
    .select({
      originLocationId: locationDistances.originLocationId,
      destinationLocationId: locationDistances.destinationLocationId,
      durationSeconds: locationDistances.durationSeconds,
    })
    .from(locationDistances)
    .where(
      and(
        inArray(locationDistances.originLocationId, allLocIds),
        inArray(locationDistances.destinationLocationId, allLocIds)
      )
    );

  const distanceMap = new Map(
    distances.map((d) => [
      `${d.originLocationId}:${d.destinationLocationId}`,
      d.durationSeconds,
    ])
  );

  // Find driver's departure time
  const driver = sorted[0];
  if (!driver?.earliestLeaveTime) {
    return {
      estimatedPickups: new Map<string, Date>(),
      estimatedEventArrival: null,
    };
  }

  let currentTime = driver.earliestLeaveTime;
  const estimatedPickups = new Map<string, Date>();

  // Driver departs at their earliestLeaveTime — no pickup needed
  // Process each consecutive leg
  let routeIdx = 0;
  for (const m of sorted) {
    if (m.pickupOrder === 0) {
      // Driver: their "pickup" is their departure
      estimatedPickups.set(m.userId, currentTime);
      routeIdx++;
      continue;
    }

    // Look up duration from previous stop to this stop
    const pair = pairs[routeIdx - 1];
    if (pair) {
      const duration = distanceMap.get(`${pair[0]}:${pair[1]}`);
      if (duration != null) {
        currentTime = addSeconds(currentTime, duration);
      }
    }
    estimatedPickups.set(m.userId, currentTime);
    routeIdx++;
  }

  // Final leg: last member's origin → event location
  let estimatedEventArrival: Date | null = null;
  const lastPair = pairs[pairs.length - 1];
  if (lastPair && eventLocationId) {
    const duration = distanceMap.get(`${lastPair[0]}:${lastPair[1]}`);
    if (duration != null) {
      estimatedEventArrival = addSeconds(currentTime, duration);
    }
  }

  return { estimatedPickups, estimatedEventArrival };
}
