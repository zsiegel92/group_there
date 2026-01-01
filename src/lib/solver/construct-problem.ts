import { db } from "@/db/db";
import { drivingStatusEnumValuesForDrivers } from "@/db/schema";
import type { Problem } from "@/python-client";

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
        },
      },
    },
  });
  if (!event) {
    throw new Error(`Event with id ${eventId} not found`);
  }
  return {
    id: `problem-${event.id}`, // TODO: nanoid? Get ID from db? Note: hashing problem should always EXCLUDE problem ID!
    event_id: event.id,
    trippers: event.eventsToUsers.map((eventToUser) => ({
      user_id: eventToUser.user.id,
      origin_id: eventToUser.originLocation,
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
    })),
    tripper_distances: [],
  } satisfies Problem;
}
