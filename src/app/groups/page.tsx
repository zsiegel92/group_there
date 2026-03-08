"use client";

import Link from "next/link";
import { format } from "date-fns";

import { AdminBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useGroups } from "../api/groups/client";

export default function GroupsPage() {
  const { data, isLoading, error } = useGroups();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-600">
          Error loading groups: {error.message}
        </div>
      </div>
    );
  }

  const groups = data?.groups || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">My Groups</h1>
        <Link href="/groups/create">
          <Button>Create Group</Button>
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">
            You&apos;re not a member of any groups yet.
          </p>
          <Link href="/groups/create">
            <Button>Create Your First Group</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((groupMembership) => (
            <Link
              key={groupMembership.group.id}
              href={`/groups/${groupMembership.group.id}`}
              className="block p-6 border rounded-lg hover:border-gray-400 transition-colors"
            >
              <h2 className="text-xl font-semibold mb-2">
                {groupMembership.group.name}
              </h2>
              <div className="flex gap-2 text-sm text-gray-600">
                {groupMembership.isAdmin && <AdminBadge />}
                <span className="text-gray-500">
                  Created{" "}
                  {format(groupMembership.group.createdAt, "MM/dd/yyyy")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
