"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateTeam } from "../../api/teams/client";

export default function CreateTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const createTeam = useCreateTeam();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const result = await createTeam.mutateAsync(name.trim());
      router.push(`/teams/${result.team.id}`);
    } catch (error) {
      console.error("Failed to create team:", error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Create a Team</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Team Name
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter team name"
            required
            maxLength={100}
            disabled={createTeam.isPending}
          />
        </div>

        {createTeam.isError && (
          <div className="text-red-600 text-sm">
            Failed to create team. Please try again.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={createTeam.isPending || !name.trim()}>
            {createTeam.isPending ? "Creating..." : "Create Team"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/teams")}
            disabled={createTeam.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
