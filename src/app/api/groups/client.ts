"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

// Response schemas
const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAdmin: z.boolean(),
  createdAt: z.coerce.date(),
});

const groupsResponseSchema = z.object({
  groups: z.array(groupSchema),
});

const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  isAdmin: z.boolean(),
  joinedAt: z.coerce.date(),
});

const groupDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  isAdmin: z.boolean(),
  members: z.array(memberSchema),
});

const groupDetailResponseSchema = z.object({
  group: groupDetailSchema,
});

const createGroupResponseSchema = z.object({
  group: groupSchema,
});

const successResponseSchema = z.object({
  success: z.boolean(),
});

const acceptInviteResponseSchema = z.object({
  success: z.boolean(),
  groupId: z.string(),
  groupName: z.string(),
});

// Client functions
export async function fetchGroups() {
  const response = await fetch("/api/groups");
  if (!response.ok) {
    throw new Error("Failed to fetch groups");
  }
  const data = await response.json();
  return groupsResponseSchema.parse(data);
}

export async function createGroup(name: string) {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to create group");
  }
  const data = await response.json();
  return createGroupResponseSchema.parse(data);
}

export async function fetchGroupDetails(groupId: string) {
  const response = await fetch(`/api/groups/${groupId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch group details");
  }
  const data = await response.json();
  return groupDetailResponseSchema.parse(data);
}

export async function deleteGroup(groupId: string) {
  const response = await fetch(`/api/groups/${groupId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete group");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

export async function inviteToGroup(groupId: string, email: string) {
  const response = await fetch(`/api/groups/${groupId}/invite`, {
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

export async function promoteToAdmin(groupId: string, userId: string) {
  const response = await fetch(`/api/groups/${groupId}/promote`, {
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
  const response = await fetch(`/api/groups/invite/accept?token=${token}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to accept invite");
  }
  const data = await response.json();
  return acceptInviteResponseSchema.parse(data);
}

export async function leaveGroup(groupId: string) {
  const response = await fetch(`/api/groups/${groupId}/leave`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to leave group");
  }
  const data = await response.json();
  return successResponseSchema.parse(data);
}

// React Query hooks
export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: fetchGroups,
  });
}

export function useGroupDetails(groupId: string) {
  return useQuery({
    queryKey: ["groups", groupId],
    queryFn: () => fetchGroupDetails(groupId),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useInviteToGroup() {
  return useMutation({
    mutationFn: ({ groupId, email }: { groupId: string; email: string }) =>
      inviteToGroup(groupId, email),
  });
}

export function usePromoteToAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      promoteToAdmin(groupId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["groups", variables.groupId],
      });
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
