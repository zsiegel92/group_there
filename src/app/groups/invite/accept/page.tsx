"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useAcceptInvite } from "../../../api/groups/client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const acceptInvite = useAcceptInvite();
  const attemptedRef = useRef(false);
  const [groupInfo, setGroupInfo] = useState<{
    groupId: string;
    groupName: string;
  } | null>(null);

  useEffect(() => {
    if (!token || attemptedRef.current) {
      return;
    }

    attemptedRef.current = true;
    acceptInvite.mutate(token, {
      onSuccess: (data) => {
        setGroupInfo({ groupId: data.groupId, groupName: data.groupName });
      },
    });
  }, [token, acceptInvite]);

  if (!token) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Invalid Link</h1>
        <p className="mb-4">This invite link is invalid or incomplete.</p>
        <Button onClick={() => router.push("/groups")}>Go to Groups</Button>
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
        <Button onClick={() => router.push("/groups")}>Go to Groups</Button>
      </div>
    );
  }

  if (acceptInvite.isSuccess && groupInfo) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-green-600">
          Welcome to {groupInfo.groupName}!
        </h1>
        <p className="mb-6">You&apos;ve successfully joined the group.</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => router.push(`/groups/${groupInfo.groupId}`)}>
            View Group
          </Button>
          <Button variant="secondary" onClick={() => router.push("/groups")}>
            All Groups
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
