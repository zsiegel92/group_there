"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useTeams } from "../api/teams/client";

export default function TeamsPage() {
  const { data, isLoading, error } = useTeams();

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
        <div className="text-red-600">Error loading teams: {error.message}</div>
      </div>
    );
  }

  const teams = data?.teams || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Teams</h1>
        <Link href="/teams/create">
          <Button>Create Team</Button>
        </Link>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">
            You&apos;re not a member of any teams yet.
          </p>
          <Link href="/teams/create">
            <Button>Create Your First Team</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="block p-6 border rounded-lg hover:border-gray-400 transition-colors"
            >
              <h2 className="text-xl font-semibold mb-2">{team.name}</h2>
              <div className="flex gap-2 text-sm text-gray-600">
                {team.isAdmin && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    Admin
                  </span>
                )}
                <span className="text-gray-500">
                  Created {team.createdAt.toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
