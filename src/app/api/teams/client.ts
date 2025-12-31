"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

// Response schemas
const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAdmin: z.boolean(),
  createdAt: z.coerce.date(),
});

const teamsResponseSchema = z.object({
  teams: z.array(teamSchema),
});

const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  isAdmin: z.boolean(),
  joinedAt: z.coerce.date(),
});

const teamDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAdmin: z.boolean(),
  members: z.array(memberSchema),
});

const teamDetailResponseSchema = z.object({
  team: teamDetailSchema,
});

const createTeamResponseSchema = z.object({
  team: teamSchema,
});

const successResponseSchema = z.object({
  success: z.boolean(),
});

const acceptInviteResponseSchema = z.object({
  success: z.boolean(),
  teamId: z.string(),
  teamName: z.string(),
});

// Client functions
export async function fetchTeams() {
  const response = await fetch("/api/teams");
  if (!response.ok) {
    throw new Error("Failed to fetch teams");
  }
  const data = await response.json();
  return teamsResponseSchema.parse(data);
}

export async function createTeam(name: string) {
  const response = await fetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to create team");
  }
  const data = await response.json();
  return createTeamResponseSchema.parse(data);
}

export async function fetchTeamDetails(teamId: string) {
  const response = await fetch(`/api/teams/${teamId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch team details");
  }
  const data = await response.json();
  return teamDetailResponseSchema.parse(data);
}

export async function deleteTeam(teamId: string) {
  const response = await fetch(`/api/teams/${teamId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete team");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

export async function inviteToTeam(teamId: string, email: string) {
  const response = await fetch(`/api/teams/${teamId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error("Failed to send invite");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

export async function promoteToAdmin(teamId: string, userId: string) {
  const response = await fetch(`/api/teams/${teamId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    throw new Error("Failed to promote user");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

export async function acceptInvite(token: string) {
  const response = await fetch(`/api/teams/invite/accept?token=${token}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to accept invite");
  }
  const data = await response.json();
  return acceptInviteResponseSchema.parse(data);
}

// React Query hooks
export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeams,
  });
}

export function useTeamDetails(teamId: string) {
  return useQuery({
    queryKey: ["teams", teamId],
    queryFn: () => fetchTeamDetails(teamId),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useInviteToTeam() {
  return useMutation({
    mutationFn: ({ teamId, email }: { teamId: string; email: string }) =>
      inviteToTeam(teamId, email),
  });
}

export function usePromoteToAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      promoteToAdmin(teamId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId] });
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}
