"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const testingGroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.coerce.date(),
  })
  .nullable();

const testingGroupResponseSchema = z.object({
  testingGroup: testingGroupSchema,
});

async function fetchTestingGroup() {
  const response = await fetch("/api/testing-group");
  if (!response.ok) {
    throw new Error("Failed to fetch testing group");
  }
  const data = await response.json();
  return testingGroupResponseSchema.parse(data);
}

async function createTestingGroup() {
  const response = await fetch("/api/testing-group", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to create testing group");
  }
  const data = await response.json();
  return testingGroupResponseSchema.parse(data);
}

export function useTestingGroup() {
  return useQuery({
    queryKey: ["testing-group"],
    queryFn: fetchTestingGroup,
  });
}

export function useCreateTestingGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTestingGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing-group"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
