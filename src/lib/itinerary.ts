import { addSeconds } from "date-fns";
import { and, inArray } from "drizzle-orm";

import { db } from "@/db/db";
import { locationDistances, type EventKind } from "@/db/schema";

export type EstimateMember = {
  userId: string;
  originLocationId: string | null;
  destinationLocationId?: string | null;
  earliestLeaveTime: Date | null;
  requiredArrivalTime?: Date | null;
  pickupOrder: number;
};

export type EstimatePartyMember = {
  userId: string;
  pickupOrder: number;
};

export type EstimateAttendance = {
  originLocationId: string | null;
  destinationLocationId?: string | null;
  earliestLeaveTime: Date | null;
  requiredArrivalTime?: Date | null;
};

type LocationPair = readonly [string, string];

export function buildEstimateMembers(
  members: readonly EstimatePartyMember[],
  attendanceLookup: ReadonlyMap<string, EstimateAttendance>,
  fallbackDestinationLocationId: string | null,
  fallbackArrivalTime: Date
) {
  return members
    .toSorted((a, b) => a.pickupOrder - b.pickupOrder)
    .map((m) => {
      const attendance = attendanceLookup.get(m.userId);
      return {
        userId: m.userId,
        originLocationId: attendance?.originLocationId ?? null,
        destinationLocationId:
          attendance?.destinationLocationId ?? fallbackDestinationLocationId,
        earliestLeaveTime: attendance?.earliestLeaveTime ?? null,
        requiredArrivalTime:
          attendance?.requiredArrivalTime ?? fallbackArrivalTime,
        pickupOrder: m.pickupOrder,
      } satisfies EstimateMember;
    });
}

function toConsecutivePairs(locationIds: readonly string[]) {
  const pairs: LocationPair[] = [];
  for (let i = 0; i < locationIds.length - 1; i++) {
    const origin = locationIds[i];
    const dest = locationIds[i + 1];
    if (origin && dest) pairs.push([origin, dest]);
  }
  return pairs;
}

function legDurationSeconds(
  distanceMap: ReadonlyMap<string, number>,
  [origin, dest]: LocationPair
) {
  if (origin === dest) return 0;
  return distanceMap.get(`${origin}:${dest}`) ?? null;
}

function sumKnownLegDurations(
  pairs: readonly LocationPair[],
  distanceMap: ReadonlyMap<string, number>
) {
  let totalRouteDuration = 0;
  for (const pair of pairs) {
    totalRouteDuration += legDurationSeconds(distanceMap, pair) ?? 0;
  }
  return totalRouteDuration;
}

async function loadDistanceMap(locationIds: readonly string[]) {
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

  const pairs = toConsecutivePairs(routeLocationIds);
  const distanceMap = await loadDistanceMap(routeLocationIds);
  const totalRouteDuration = sumKnownLegDurations(pairs, distanceMap);

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
      const duration = legDurationSeconds(distanceMap, pair);
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
    const duration = legDurationSeconds(distanceMap, lastPair);
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

  const pairs = toConsecutivePairs(routeLocationIds);
  const distanceMap = await loadDistanceMap(routeLocationIds);
  const totalRouteDuration = sumKnownLegDurations(pairs, distanceMap);

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
        const duration = legDurationSeconds(distanceMap, pair);
        if (duration != null) currentTime = addSeconds(currentTime, duration);
      }
    }
    estimatedPickups.set(member.userId, currentTime);
  }

  let estimatedEventArrival = currentTime;
  for (let i = sorted.length - 1; i < pairs.length; i++) {
    const pair = pairs[i];
    if (pair) {
      const duration = legDurationSeconds(distanceMap, pair);
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
  kind: EventKind = "shared_destination"
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
