"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateGroup } from "../../api/groups/client";

export default function CreateGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const createGroup = useCreateGroup();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const result = await createGroup.mutateAsync(name.trim());
      router.push(`/groups/${result.group.id}`);
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Create a Group</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Group Name
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name"
            required
            maxLength={100}
            disabled={createGroup.isPending}
          />
        </div>

        {createGroup.isError && (
          <div className="text-red-600 text-sm">
            Failed to create group. Please try again.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={createGroup.isPending || !name.trim()}>
            {createGroup.isPending ? "Creating..." : "Create Group"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/groups")}
            disabled={createGroup.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
