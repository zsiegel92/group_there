"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
  drivingStatusEnumValues,
  // type DrivingStatus,
} from "@/db/schema";

// Response schemas
const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const eventDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  time: z.string(),
  message: z.string().nullable(),
  scheduled: z.boolean(),
  createdAt: z.string(),
});

const denormalizedEventSchema = z.object({
  group: groupSchema,
  eventDetails: eventDetailsSchema,
  hasJoined: z.boolean(),
  isGroupAdmin: z.boolean(),
});

const eventsResponseSchema = z.object({
  events: z.array(denormalizedEventSchema),
});

const userAttendanceSchema = z.object({
  drivingStatus: z.enum(drivingStatusEnumValues),
  carFits: z.number().nullable(),
  earliestLeaveTime: z.string().nullable(),
  originLocation: z.string(),
  joinedAt: z.string(),
});

type UserAttendance = z.infer<typeof userAttendanceSchema>;

const attendeeSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  userImage: z.string().nullable(),
  userAttendance: userAttendanceSchema,
});

const eventDetailSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupName: z.string(),
  name: z.string(),
  location: z.string(),
  time: z.string(),
  message: z.string().nullable(),
  scheduled: z.boolean(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
  hasJoined: z.boolean(),
  userAttendance: userAttendanceSchema.nullable(),
  attendees: z.array(attendeeSchema),
});

const eventDetailResponseSchema = z.object({
  event: eventDetailSchema,
});

const createEventSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  name: z.string(),
  location: z.string(),
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
    location: z.string(),
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
    originLocation: z.string(),
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
export async function fetchEvents() {
  const response = await fetch("/api/events");
  if (!response.ok) {
    throw new Error("Failed to fetch events");
  }
  const data = await response.json();
  return eventsResponseSchema.parse(data);
}

export async function createEvent(input: {
  groupId: string;
  name: string;
  location: string;
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
    location?: string;
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
    throw new Error("Failed to update event");
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

export async function attendEvent(eventId: string, input: UserAttendance) {
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

export async function updateAttendance(eventId: string, input: UserAttendance) {
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

// React Query hooks
export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
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
        location?: string;
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
      input: UserAttendance;
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
      input: UserAttendance;
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
