"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
  blastTypeValues,
  drivingStatusEnumValues,
  groupTypeValues,
  // type DrivingStatus,
} from "@/db/schema";
import { LocationSchema } from "@/lib/geo/schema";

// Response schemas
const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(groupTypeValues).optional().default("social"),
});

const locationSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    addressString: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
  })
  .nullable();

const eventDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  locationId: z.string().nullable(),
  location: locationSummarySchema,
  time: z.string(),
  message: z.string().nullable(),
  scheduled: z.boolean(),
  locked: z.boolean(),
  createdAt: z.string(),
});

const denormalizedEventSchema = z.object({
  group: groupSchema,
  eventDetails: eventDetailsSchema,
  attendeeCount: z.number(),
  hasJoined: z.boolean(),
  isGroupAdmin: z.boolean(),
});

const eventsResponseSchema = z.object({
  events: z.array(denormalizedEventSchema),
});

const userAttendanceResponseSchema = z.object({
  drivingStatus: z.enum(drivingStatusEnumValues),
  carFits: z.number().nullable(),
  earliestLeaveTime: z.string().nullable(),
  originLocationId: z.string().nullable(),
  originLocation: LocationSchema.nullable(),
  joinedAt: z.string(),
  directTravelSeconds: z.number().nullable(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const userAttendanceInputSchema = z.object({
  drivingStatus: z.enum(drivingStatusEnumValues),
  carFits: z.number().nullable(),
  earliestLeaveTime: z.string().nullable(),
  originLocationId: z.string(),
  joinedAt: z.string(),
});

type UserAttendanceInput = z.infer<typeof userAttendanceInputSchema>;

const attendeeSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  userImage: z.string().nullable(),
  userAttendance: userAttendanceResponseSchema,
});

const solutionPartyMemberSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string().optional(),
  pickupOrder: z.number(),
  originLocation: LocationSchema.nullable(),
  originLocationId: z.string().nullable(),
  earliestLeaveTime: z.string().nullable(),
  estimatedPickup: z.string().nullable().optional(),
});

const solutionPartySchema = z.object({
  id: z.string(),
  partyIndex: z.number(),
  driverUserId: z.string().nullable(),
  driverName: z.string().nullable(),
  estimatedEventArrival: z.string().nullable().optional(),
  members: z.array(solutionPartyMemberSchema),
});

const solutionSchema = z.object({
  id: z.string(),
  feasible: z.boolean(),
  optimal: z.boolean(),
  totalDriveSeconds: z.number(),
  parties: z.array(solutionPartySchema),
});

const myPartyMemberSchema = solutionPartyMemberSchema.extend({
  userEmail: z.string(),
  estimatedPickup: z.string().nullable(),
});

const myPartySchema = z.object({
  role: z.enum(["driver", "passenger"]),
  partyIndex: z.number(),
  estimatedEventArrival: z.string().nullable(),
  members: z.array(myPartyMemberSchema),
});

const blastSchema = z.object({
  id: z.string(),
  type: z.enum(blastTypeValues),
  recipientCount: z.number(),
  createdAt: z.string(),
});

const eventDetailSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupName: z.string(),
  name: z.string(),
  locationId: z.string().nullable(),
  location: LocationSchema.nullable(),
  time: z.string(),
  message: z.string().nullable(),
  scheduled: z.boolean(),
  locked: z.boolean(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
  hasJoined: z.boolean(),
  userAttendance: userAttendanceResponseSchema.nullable(),
  attendees: z.array(attendeeSchema).optional().default([]),
  attendeeCount: z.number(),
  solution: solutionSchema.nullable().optional(),
  myParty: myPartySchema.nullable().optional(),
  blasts: z.array(blastSchema).optional().default([]),
});

export type EventDetail = z.infer<typeof eventDetailSchema>;
export type SolutionPartyMember = z.infer<typeof solutionPartyMemberSchema>;
export type MyPartyMember = z.infer<typeof myPartyMemberSchema>;
export type MyParty = z.infer<typeof myPartySchema>;

const eventDetailResponseSchema = z.object({
  event: eventDetailSchema,
});

const createEventSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  name: z.string(),
  locationId: z.string().nullable(),
  time: z.string(),
  message: z.string().nullable(),
  scheduled: z.boolean(),
  createdAt: z.string(),
});

const createEventResponseSchema = z.object({
  event: createEventSchema,
});

const updateEventResponseSchema = z.object({
  event: z.object({
    id: z.string(),
    groupId: z.string(),
    name: z.string(),
    locationId: z.string().nullable(),
    time: z.string(),
    message: z.string().nullable(),
    scheduled: z.boolean(),
    updatedAt: z.string(),
  }),
});

const successResponseSchema = z.object({
  success: z.boolean(),
});

const attendanceResponseSchema = z.object({
  success: z.boolean(),
  attendance: z.object({
    eventId: z.string(),
    userId: z.string(),
    drivingStatus: z.enum(drivingStatusEnumValues),
    carFits: z.number().nullable(),
    earliestLeaveTime: z.string().nullable(),
    originLocationId: z.string(),
  }),
});

const scheduleResponseSchema = z.object({
  success: z.boolean(),
  event: z.object({
    id: z.string(),
    scheduled: z.boolean(),
    haveSentInvitationEmails: z.boolean(),
  }),
});

// Client functions
export async function fetchEvents(groupId?: string) {
  const url = groupId ? `/api/events?groupId=${groupId}` : "/api/events";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch events");
  }
  const data = await response.json();
  return eventsResponseSchema.parse(data);
}

export async function createEvent(input: {
  groupId: string;
  name: string;
  locationId: string;
  time: string;
  message?: string;
}) {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to create event");
  }
  const data = await response.json();
  return createEventResponseSchema.parse(data);
}

export async function fetchEventDetails(eventId: string) {
  const response = await fetch(`/api/events/${eventId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch event details");
  }
  const data = await response.json();
  return eventDetailResponseSchema.parse(data);
}

export async function updateEvent(
  eventId: string,
  input: {
    name?: string;
    locationId?: string;
    time?: string;
    message?: string;
  }
) {
  const response = await fetch(`/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error ?? "Failed to update event");
  }
  const data = await response.json();
  return updateEventResponseSchema.parse(data);
}

export async function deleteEvent(eventId: string) {
  const response = await fetch(`/api/events/${eventId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete event");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

export async function attendEvent(eventId: string, input: UserAttendanceInput) {
  const response = await fetch(`/api/events/${eventId}/attend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to join event");
  }
  const data = await response.json();
  return attendanceResponseSchema.parse(data);
}

export async function updateAttendance(
  eventId: string,
  input: UserAttendanceInput
) {
  const response = await fetch(`/api/events/${eventId}/attend`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update attendance");
  }
  const data = await response.json();
  return attendanceResponseSchema.parse(data);
}

export async function leaveEvent(eventId: string) {
  const response = await fetch(`/api/events/${eventId}/attend`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to leave event");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

export async function scheduleEvent(eventId: string) {
  const response = await fetch(`/api/events/${eventId}/schedule`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to schedule event");
  }
  const data = await response.json();
  return scheduleResponseSchema.parse(data);
}

export async function unscheduleEvent(eventId: string) {
  const response = await fetch(`/api/events/${eventId}/unschedule`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to unschedule event");
  }
  const data = await response.json();
  return scheduleResponseSchema.parse(data);
}

// Confirm itinerary (lock event with solution)
export async function confirmItinerary(
  eventId: string,
  input: {
    parties: { driverUserId: string; passengerUserIds: string[] }[];
    totalDriveSeconds: number;
    feasible: boolean;
    optimal: boolean;
  }
) {
  const response = await fetch(`/api/events/${eventId}/confirm-itinerary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to confirm itinerary");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

// Unlock event (delete solution)
export async function unlockEvent(eventId: string) {
  const response = await fetch(`/api/events/${eventId}/unlock`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to unlock event");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

// Blast notifications
const blastResponseSchema = z.object({
  success: z.boolean(),
  recipientCount: z.number(),
});

export type BlastResponse = z.infer<typeof blastResponseSchema>;

export async function sendBlast(
  eventId: string,
  type: (typeof blastTypeValues)[number]
) {
  const response = await fetch(`/api/events/${eventId}/blast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to send notification");
  }
  const data = await response.json();
  return blastResponseSchema.parse(data);
}

// Distance status
const distanceStatusSchema = z.object({
  complete: z.boolean(),
  have: z.number(),
  need: z.number(),
});

export async function fetchDistanceStatus(eventId: string) {
  const response = await fetch(`/api/events/${eventId}/distances`);
  if (!response.ok) {
    throw new Error("Failed to fetch distance status");
  }
  const data = await response.json();
  return distanceStatusSchema.parse(data);
}

export async function triggerDistanceCalculation(eventId: string) {
  const response = await fetch(`/api/events/${eventId}/distances`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to trigger distance calculation");
  }
}

// Route polylines
const routePolylinesResponseSchema = z.object({
  polylines: z.record(z.string(), z.string().nullable()),
});

export async function fetchRoutePolylines(
  eventId: string,
  pairs: { originLocationId: string; destinationLocationId: string }[]
) {
  const response = await fetch(`/api/events/${eventId}/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairs }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch route polylines");
  }
  const data = await response.json();
  return routePolylinesResponseSchema.parse(data);
}

// React Query hooks
export function useEvents(groupId?: string) {
  return useQuery({
    queryKey: groupId ? ["events", { groupId }] : ["events"],
    queryFn: () => fetchEvents(groupId),
  });
}

export function useEventDetails(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId],
    queryFn: () => fetchEventDetails(eventId),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: {
        name?: string;
        locationId?: string;
        time?: string;
        message?: string;
      };
    }) => updateEvent(eventId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useAttendEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: UserAttendanceInput;
    }) => attendEvent(eventId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
    },
  });
}

export function useUpdateAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: UserAttendanceInput;
    }) => updateAttendance(eventId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
    },
  });
}

export function useLeaveEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveEvent,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useScheduleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: scheduleEvent,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useUnscheduleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unscheduleEvent,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useConfirmItinerary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: {
        parties: { driverUserId: string; passengerUserIds: string[] }[];
        totalDriveSeconds: number;
        feasible: boolean;
        optimal: boolean;
      };
    }) => confirmItinerary(eventId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
    },
  });
}

export function useUnlockEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unlockEvent,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", eventId] });
    },
  });
}

export function useSendBlast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      type,
    }: {
      eventId: string;
      type: (typeof blastTypeValues)[number];
    }) => sendBlast(eventId, type),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
    },
  });
}

export function useDistanceStatus(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId, "distances"],
    queryFn: () => fetchDistanceStatus(eventId),
    refetchInterval: (query) => {
      // Poll every 3 seconds while incomplete, stop when complete
      if (query.state.data?.complete) return false;
      return 3000;
    },
  });
}

export function useTriggerDistanceCalculation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerDistanceCalculation,
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({
        queryKey: ["events", eventId, "distances"],
      });
    },
  });
}
