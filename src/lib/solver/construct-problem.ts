import { db } from "@/db/db";
import { drivingStatusEnumValuesForDrivers } from "@/db/schema";
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

  const trippers: Tripper[] = event.eventsToUsers.map((eventToUser) => ({
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
    distance_to_destination_seconds: 0,
    must_drive: eventToUser.drivingStatus === "must_drive",
  }));

  // Generate all pairwise distances (set to 0 for now)
  const tripperDistances: TripperDistance[] = [];
  for (const tripper1 of trippers) {
    for (const tripper2 of trippers) {
      if (tripper1.user_id !== tripper2.user_id) {
        tripperDistances.push({
          origin_user_id: tripper1.user_id,
          destination_user_id: tripper2.user_id,
          distance_seconds: 0,
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
