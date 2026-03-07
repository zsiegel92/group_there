import { and, inArray } from "drizzle-orm";

import { db } from "@/db/db";
import {
  drivingStatusEnumValuesForDrivers,
  locationDistances,
} from "@/db/schema";
import type { Problem, Tripper, TripperDistance } from "@/python-client";

export async function constructProblem(eventId: string): Promise<Problem> {
  const event = await db.query.events.findFirst({
    where: (events, { eq }) => eq(events.id, eventId),
    with: {
      group: {
        with: {
          groupsToUsers: {
            with: {
              user: true,
            },
          },
        },
      },
      eventsToUsers: {
        with: {
          user: true,
          originLocation: true,
        },
      },
    },
  });
  if (!event) {
    throw new Error(`Event with id ${eventId} not found`);
  }

  // Build a map from userId -> originLocationId for distance lookups
  const userToLocationId = new Map<string, string>();
  for (const etu of event.eventsToUsers) {
    if (etu.originLocationId) {
      userToLocationId.set(etu.userId, etu.originLocationId);
    }
  }

  // Collect all relevant location IDs (attendee origins + event destination)
  const allLocationIds = [
    ...new Set([
      ...[...userToLocationId.values()],
      ...(event.locationId ? [event.locationId] : []),
    ]),
  ];

  // Fetch all pairwise distances from the DB
  const distances =
    allLocationIds.length >= 2
      ? await db
          .select()
          .from(locationDistances)
          .where(
            and(
              inArray(locationDistances.originLocationId, allLocationIds),
              inArray(locationDistances.destinationLocationId, allLocationIds)
            )
          )
      : [];

  // Build a lookup: "originLocId:destLocId" -> durationSeconds
  const distanceLookup = new Map<string, number>();
  for (const d of distances) {
    distanceLookup.set(
      `${d.originLocationId}:${d.destinationLocationId}`,
      d.durationSeconds
    );
  }

  const trippers: Tripper[] = event.eventsToUsers.map((eventToUser) => {
    const originLocId = userToLocationId.get(eventToUser.userId);
    const distToDestination =
      originLocId && event.locationId
        ? (distanceLookup.get(`${originLocId}:${event.locationId}`) ?? 0)
        : 0;

    return {
      user_id: eventToUser.user.id,
      origin_id: eventToUser.originLocationId ?? eventToUser.user.id,
      event_id: event.id,
      car_fits: drivingStatusEnumValuesForDrivers.includes(
        eventToUser.drivingStatus
      )
        ? eventToUser.carFits
        : 0,
      seconds_before_event_start_can_leave: eventToUser.earliestLeaveTime
        ? eventToUser.earliestLeaveTime.getTime()
        : 0,
      distance_to_destination_seconds: distToDestination,
      must_drive: eventToUser.drivingStatus === "must_drive",
    };
  });

  // Generate all pairwise distances using real data
  const tripperDistances: TripperDistance[] = [];
  for (const t1 of trippers) {
    for (const t2 of trippers) {
      if (t1.user_id !== t2.user_id) {
        const originLoc1 = userToLocationId.get(t1.user_id);
        const originLoc2 = userToLocationId.get(t2.user_id);
        const seconds =
          originLoc1 && originLoc2
            ? (distanceLookup.get(`${originLoc1}:${originLoc2}`) ?? 0)
            : 0;

        tripperDistances.push({
          origin_user_id: t1.user_id,
          destination_user_id: t2.user_id,
          distance_seconds: seconds,
        });
      }
    }
  }

  return {
    id: `problem-${event.id}`, // TODO: nanoid? Get ID from db? Note: hashing problem should always EXCLUDE problem ID!
    event_id: event.id,
    trippers,
    tripper_distances: tripperDistances,
  } satisfies Problem;
}
