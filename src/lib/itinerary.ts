import { addSeconds } from "date-fns";
import { and, inArray } from "drizzle-orm";

import { db } from "@/db/db";
import { locationDistances } from "@/db/schema";

type EstimateMember = {
  userId: string;
  originLocationId: string | null;
  destinationLocationId?: string | null;
  earliestLeaveTime: Date | null;
  requiredArrivalTime?: Date | null;
  pickupOrder: number;
};

async function loadDistanceMap(locationIds: string[]) {
  const allLocIds = [...new Set(locationIds)];
  if (allLocIds.length < 2) return new Map<string, number>();

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

  return new Map(
    distances.map((d) => [
      `${d.originLocationId}:${d.destinationLocationId}`,
      d.durationSeconds,
    ])
  );
}

/**
 * Given a party's members (sorted by pickupOrder) and the event's locationId,
 * compute estimated pickup times for each stop and the final arrival at the event.
 *
 * Returns { estimatedPickups: Map<userId, Date>, estimatedEventArrival: Date | null }
 */
export async function computeSharedDestinationPartyEstimates(
  members: EstimateMember[],
  eventLocationId: string | null,
  eventTime: Date
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

  const distanceMap = await loadDistanceMap(routeLocationIds);

  // Sum all leg durations to get total route duration
  let totalRouteDuration = 0;
  for (const [origin, dest] of pairs) {
    const duration = distanceMap.get(`${origin}:${dest}`);
    if (duration != null) {
      totalRouteDuration += duration;
    }
  }

  // Backward-compute: depart so that the group arrives at event time
  const idealDeparture = addSeconds(eventTime, -totalRouteDuration);

  const driver = sorted[0];
  // Use the later of idealDeparture and driver's earliest leave time
  const actualDeparture =
    driver?.earliestLeaveTime && driver.earliestLeaveTime > idealDeparture
      ? driver.earliestLeaveTime
      : idealDeparture;

  // Forward-compute pickup times from actualDeparture
  let currentTime = actualDeparture;
  const estimatedPickups = new Map<string, Date>();

  let routeIdx = 0;
  for (const m of sorted) {
    if (m.pickupOrder === 0) {
      // Driver: their "pickup" is their departure
      estimatedPickups.set(m.userId, currentTime);
      routeIdx++;
      continue;
    }

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

export async function computeCommutePartyEstimates(
  members: EstimateMember[],
  eventTime: Date
) {
  const sorted = [...members].sort((a, b) => a.pickupOrder - b.pickupOrder);
  const driver = sorted[0];
  if (!driver?.destinationLocationId) {
    return {
      estimatedPickups: new Map<string, Date>(),
      estimatedEventArrival: null,
    };
  }

  const routeLocationIds: string[] = [];
  for (const member of sorted) {
    if (member.originLocationId) routeLocationIds.push(member.originLocationId);
  }
  for (const member of sorted.slice(1)) {
    if (member.destinationLocationId) {
      routeLocationIds.push(member.destinationLocationId);
    }
  }
  routeLocationIds.push(driver.destinationLocationId);

  if (routeLocationIds.length < 2) {
    return {
      estimatedPickups: new Map<string, Date>(),
      estimatedEventArrival: null,
    };
  }

  const pairs: [string, string][] = [];
  for (let i = 0; i < routeLocationIds.length - 1; i++) {
    const origin = routeLocationIds[i]!;
    const dest = routeLocationIds[i + 1]!;
    pairs.push([origin, dest]);
  }

  const distanceMap = await loadDistanceMap(routeLocationIds);
  let totalRouteDuration = 0;
  for (const [origin, dest] of pairs) {
    const duration = origin === dest ? 0 : distanceMap.get(`${origin}:${dest}`);
    if (duration != null) totalRouteDuration += duration;
  }

  const requiredArrival = driver.requiredArrivalTime ?? eventTime;
  const idealDeparture = addSeconds(requiredArrival, -totalRouteDuration);
  const actualDeparture =
    driver.earliestLeaveTime && driver.earliestLeaveTime > idealDeparture
      ? driver.earliestLeaveTime
      : idealDeparture;

  let currentTime = actualDeparture;
  const estimatedPickups = new Map<string, Date>();
  for (let i = 0; i < sorted.length; i++) {
    const member = sorted[i]!;
    if (i > 0) {
      const pair = pairs[i - 1];
      if (pair) {
        const duration =
          pair[0] === pair[1] ? 0 : distanceMap.get(`${pair[0]}:${pair[1]}`);
        if (duration != null) currentTime = addSeconds(currentTime, duration);
      }
    }
    estimatedPickups.set(member.userId, currentTime);
  }

  let estimatedEventArrival = currentTime;
  for (let i = sorted.length - 1; i < pairs.length; i++) {
    const pair = pairs[i];
    if (pair) {
      const duration =
        pair[0] === pair[1] ? 0 : distanceMap.get(`${pair[0]}:${pair[1]}`);
      if (duration != null) {
        estimatedEventArrival = addSeconds(estimatedEventArrival, duration);
      }
    }
  }

  return { estimatedPickups, estimatedEventArrival };
}

export async function computePartyEstimates(
  members: EstimateMember[],
  eventLocationId: string | null,
  eventTime: Date,
  kind: "shared_destination" | "commute" = "shared_destination"
) {
  if (kind === "commute") {
    return computeCommutePartyEstimates(members, eventTime);
  }
  return computeSharedDestinationPartyEstimates(
    members,
    eventLocationId,
    eventTime
  );
}
