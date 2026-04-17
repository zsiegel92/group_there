import { and, inArray } from "drizzle-orm";

import { db } from "@/db/db";
import {
  drivingStatusEnumValuesForDrivers,
  locationDistances,
} from "@/db/schema";
import type {
  ExternalRideshareVehicle,
  Problem,
  Tripper,
  TripperDistance,
} from "@/python-client";

function secondsBetween(later: Date, earlier: Date) {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 1000));
}

export async function constructTripProblem(eventId: string): Promise<Problem> {
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
          destinationLocation: true,
        },
      },
    },
  });
  if (!event) {
    throw new Error(`Event with id ${eventId} not found`);
  }

  const userToOriginLocationId = new Map<string, string>();
  const userToDestinationLocationId = new Map<string, string>();

  for (const attendee of event.eventsToUsers) {
    if (attendee.originLocationId) {
      userToOriginLocationId.set(attendee.userId, attendee.originLocationId);
    }

    const destinationLocationId =
      attendee.destinationLocationId ?? event.locationId;
    if (destinationLocationId) {
      userToDestinationLocationId.set(attendee.userId, destinationLocationId);
    }
  }

  const allLocationIds = [
    ...new Set([
      ...userToOriginLocationId.values(),
      ...userToDestinationLocationId.values(),
      ...(event.locationId ? [event.locationId] : []),
    ]),
  ];

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

  const distanceLookup = new Map<string, number>();
  for (const distance of distances) {
    distanceLookup.set(
      `${distance.originLocationId}:${distance.destinationLocationId}`,
      distance.durationSeconds
    );
  }

  const trippers: Tripper[] = event.eventsToUsers.map((eventToUser) => {
    const originLocationId = userToOriginLocationId.get(eventToUser.userId);
    const destinationLocationId = userToDestinationLocationId.get(
      eventToUser.userId
    );
    const requiredArrivalTime = eventToUser.requiredArrivalTime ?? event.time;
    const distanceToDestination =
      originLocationId && destinationLocationId
        ? (distanceLookup.get(`${originLocationId}:${destinationLocationId}`) ??
          0)
        : 0;

    return {
      user_id: eventToUser.user.id,
      origin_id: eventToUser.originLocationId ?? eventToUser.user.id,
      event_id: event.id,
      destination_id: destinationLocationId ?? null,
      required_arrival_time: requiredArrivalTime.toISOString(),
      car_fits: drivingStatusEnumValuesForDrivers.includes(
        eventToUser.drivingStatus
      )
        ? eventToUser.carFits
        : 0,
      seconds_before_event_start_can_leave: eventToUser.earliestLeaveTime
        ? secondsBetween(event.time, eventToUser.earliestLeaveTime)
        : 0,
      seconds_before_required_arrival_can_leave: eventToUser.earliestLeaveTime
        ? secondsBetween(requiredArrivalTime, eventToUser.earliestLeaveTime)
        : 0,
      distance_to_destination_seconds: distanceToDestination,
      must_drive: eventToUser.drivingStatus === "must_drive",
    };
  });

  const tripperDistances: TripperDistance[] = [];
  for (const t1 of trippers) {
    for (const t2 of trippers) {
      if (t1.user_id !== t2.user_id) {
        const originLocation1 = userToOriginLocationId.get(t1.user_id);
        const originLocation2 = userToOriginLocationId.get(t2.user_id);
        const seconds =
          originLocation1 && originLocation2
            ? (distanceLookup.get(`${originLocation1}:${originLocation2}`) ?? 0)
            : 0;

        tripperDistances.push({
          origin_user_id: t1.user_id,
          destination_user_id: t2.user_id,
          distance_seconds: seconds,
        });
      }
    }
  }

  const externalRideshareVehicles: ExternalRideshareVehicle[] =
    event.externalRideshareMode === "disabled"
      ? []
      : event.eventsToUsers
          .filter(
            (eventToUser) =>
              eventToUser.drivingStatus === "cannot_drive" &&
              eventToUser.originLocationId
          )
          .map((eventToUser) => ({
            id: `rideshare-${event.id}-${eventToUser.userId}`,
            origin_id: eventToUser.originLocationId ?? eventToUser.userId,
            car_fits: event.externalRideshareSeats,
            cost_multiplier: event.externalRideshareCostMultiplier,
            fixed_cost_seconds: event.externalRideshareFixedCostSeconds,
          }));

  return {
    id: `problem-${event.id}`,
    event_id: event.id,
    kind: event.kind,
    external_rideshare_mode: event.externalRideshareMode,
    external_rideshare_seats: event.externalRideshareSeats,
    external_rideshare_cost_multiplier: event.externalRideshareCostMultiplier,
    external_rideshare_fixed_cost_seconds:
      event.externalRideshareFixedCostSeconds,
    external_rideshare_vehicles: externalRideshareVehicles,
    trippers,
    tripper_distances: tripperDistances,
  } satisfies Problem;
}

export const constructProblem = constructTripProblem;
