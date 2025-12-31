"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useAcceptInvite } from "../../../api/teams/client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const acceptInvite = useAcceptInvite();
  const attemptedRef = useRef(false);
  const [teamInfo, setTeamInfo] = useState<{
    teamId: string;
    teamName: string;
  } | null>(null);

  useEffect(() => {
    if (!token || attemptedRef.current) {
      return;
    }

    attemptedRef.current = true;
    acceptInvite.mutate(token, {
      onSuccess: (data) => {
        setTeamInfo({ teamId: data.teamId, teamName: data.teamName });
      },
    });
  }, [token, acceptInvite]);

  if (!token) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Invalid Link</h1>
        <p className="mb-4">This invite link is invalid or incomplete.</p>
        <Button onClick={() => router.push("/teams")}>Go to Teams</Button>
      </div>
    );
  }

  if (acceptInvite.isPending) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md text-center">
        <Spinner />
        <p className="mt-4">Accepting invite...</p>
      </div>
    );
  }

  if (acceptInvite.isError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
        <p className="mb-4">{acceptInvite.error.message}</p>
        <Button onClick={() => router.push("/teams")}>Go to Teams</Button>
      </div>
    );
  }

  if (acceptInvite.isSuccess && teamInfo) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-green-600">
          Welcome to {teamInfo.teamName}!
        </h1>
        <p className="mb-6">You&apos;ve successfully joined the team.</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => router.push(`/teams/${teamInfo.teamId}`)}>
            View Team
          </Button>
          <Button variant="secondary" onClick={() => router.push("/teams")}>
            All Teams
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
