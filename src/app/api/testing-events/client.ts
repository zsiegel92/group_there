"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { drivingStatusEnumValues, type DrivingStatus } from "@/db/schema";

// Rider schemas
const riderLocationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    addressString: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  })
  .nullable();

const riderSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  isTestUser: z.boolean(),
  drivingStatus: z.enum(drivingStatusEnumValues),
  nonDriverSeats: z.number().int().min(0).max(5),
  earliestLeaveTime: z.string().nullable(),
  originLocationId: z.string().nullable(),
  originLocation: riderLocationSchema,
  destinationLocationId: z.string().nullable(),
  destinationLocation: riderLocationSchema,
  requiredArrivalTime: z.string().nullable(),
  directTravelSeconds: z.number().nullable(),
});

export type TestRider = z.infer<typeof riderSchema>;

export type RiderFieldUpdate = {
  drivingStatus?: DrivingStatus;
  nonDriverSeats?: number;
  earliestLeaveTime?: string | null;
};

const ridersResponseSchema = z.object({
  riders: z.array(riderSchema),
});

const generateRidersResponseSchema = z.object({
  success: z.boolean(),
  generatedCount: z.number(),
  riders: z.array(z.object({ userId: z.string(), name: z.string() })),
});

const successResponseSchema = z.object({
  success: z.boolean(),
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
});

async function getErrorMessage(response: Response, fallback: string) {
  const data: unknown = await response.json().catch(() => null);
  const parsed = errorResponseSchema.safeParse(data);
  return parsed.success ? (parsed.data.error ?? fallback) : fallback;
}

// Fetch riders
async function fetchRiders(eventId: string) {
  const response = await fetch(`/api/testing-events/${eventId}/riders`);
  if (!response.ok) throw new Error("Failed to fetch riders");
  const data = await response.json();
  return ridersResponseSchema.parse(data);
}

// Generate riders
async function generateRiders(
  eventId: string,
  input: { count: number; radiusMiles: number; centerLocationId?: string }
) {
  const response = await fetch(
    `/api/testing-events/${eventId}/generate-riders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, "Failed to generate riders")
    );
  }
  const data = await response.json();
  return generateRidersResponseSchema.parse(data);
}

// Bulk update riders
async function updateRiders(
  eventId: string,
  updates: {
    userId: string;
    drivingStatus?: DrivingStatus;
    nonDriverSeats?: number;
    earliestLeaveTime?: string | null;
  }[]
) {
  const response = await fetch(`/api/testing-events/${eventId}/riders`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  if (!response.ok) throw new Error("Failed to update riders");
  const data = await response.json();
  return successResponseSchema.parse(data);
}

// Delete rider(s)
async function deleteRider(eventId: string, userId: string) {
  const response = await fetch(
    `/api/testing-events/${eventId}/riders?userId=${userId}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error("Failed to delete rider");
}

async function deleteAllRiders(eventId: string) {
  const response = await fetch(
    `/api/testing-events/${eventId}/riders?all=true`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error("Failed to delete all riders");
}

// Hooks
export function useTestRiders(eventId: string) {
  return useQuery({
    queryKey: ["testing-events", eventId, "riders"],
    queryFn: () => fetchRiders(eventId),
  });
}

export function useGenerateRiders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: { count: number; radiusMiles: number; centerLocationId?: string };
    }) => generateRiders(eventId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["testing-events", variables.eventId, "riders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId, "distances"],
      });
    },
  });
}

export function useUpdateRiders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      updates,
    }: {
      eventId: string;
      updates: {
        userId: string;
        drivingStatus?: DrivingStatus;
        nonDriverSeats?: number;
        earliestLeaveTime?: string | null;
      }[];
    }) => updateRiders(eventId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["testing-events", variables.eventId, "riders"],
      });
    },
  });
}

export function useDeleteRider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      deleteRider(eventId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["testing-events", variables.eventId, "riders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["events", variables.eventId],
      });
    },
  });
}

export function useDeleteAllRiders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => deleteAllRiders(eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({
        queryKey: ["testing-events", eventId, "riders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["events", eventId],
      });
    },
  });
}
