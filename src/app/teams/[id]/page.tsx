"use client";

import { use, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";

import {
  useDeleteTeam,
  useInviteToTeam,
  useLeaveTeam,
  usePromoteToAdmin,
  useTeamDetails,
} from "../../api/teams/client";

export default function TeamDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const teamId = params.id;
  const { data: session } = useSession();

  const { data, isLoading, error, refetch } = useTeamDetails(teamId);
  const deleteTeam = useDeleteTeam();
  const leaveTeam = useLeaveTeam();
  const inviteToTeam = useInviteToTeam();
  const promoteToAdmin = usePromoteToAdmin();

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([""]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);

  const handleEmailChange = (index: number, value: string) => {
    const newEmails = [...inviteEmails];
    newEmails[index] = value;

    // Filter out all empty strings and add exactly one at the end
    const nonEmpty = newEmails.filter((email) => email.trim() !== "");
    setInviteEmails([...nonEmpty, ""]);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty emails
    const validEmails = inviteEmails
      .map((email) => email.trim())
      .filter((email) => email !== "");

    if (validEmails.length === 0) return;

    setSendingInvites(true);
    try {
      // Send all invites in parallel
      await Promise.all(
        validEmails.map((email) => inviteToTeam.mutateAsync({ teamId, email }))
      );
      setInviteEmails([""]);
      setShowInviteDialog(false);
      alert(
        `Invite${validEmails.length > 1 ? "s" : ""} sent successfully to ${validEmails.length} email${validEmails.length > 1 ? "s" : ""}!`
      );
    } catch (error) {
      console.error("Failed to send invites:", error);
      alert("Failed to send some invites. Please try again.");
    } finally {
      setSendingInvites(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTeam.mutateAsync(teamId);
      router.push("/teams");
    } catch (error) {
      console.error("Failed to delete team:", error);
      alert("Failed to delete team. Please try again.");
    }
  };

  const handleLeave = async () => {
    try {
      await leaveTeam.mutateAsync(teamId);
      router.push("/teams");
    } catch (error) {
      console.error("Failed to leave team:", error);
      alert("Failed to leave team. Please try again.");
    }
  };

  const handlePromote = async (userId: string) => {
    try {
      await promoteToAdmin.mutateAsync({ teamId, userId });
      refetch();
    } catch (error) {
      console.error("Failed to promote user:", error);
      alert("Failed to promote user. Please try again.");
    }
  };

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
        <div className="text-red-600">Error loading team: {error.message}</div>
      </div>
    );
  }

  const team = data?.team;
  if (!team) return null;

  // Check if the current user is the only admin
  const adminCount = team.members.filter((m) => m.isAdmin).length;
  const isOnlyAdmin = team.isAdmin && adminCount === 1;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold">{team.name}</h1>
          <div className="flex flex-wrap gap-2">
            {team.isAdmin && (
              <>
                <Button
                  onClick={() => setShowInviteDialog(true)}
                  size="sm"
                  className="sm:h-10"
                >
                  Invite Members
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  size="sm"
                  className="sm:h-10"
                >
                  Delete Team
                </Button>
              </>
            )}
            <Button
              variant="destructive"
              onClick={() => setShowLeaveConfirm(true)}
              disabled={isOnlyAdmin}
              size="sm"
              className="sm:h-10"
              title={
                isOnlyAdmin
                  ? "You cannot leave the team as the only admin. Promote another member to admin first or delete the team."
                  : undefined
              }
            >
              Leave Team
            </Button>
          </div>
        </div>
        {team.isAdmin && (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
            You are an admin
          </span>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">
          Members ({team.members.length})
        </h2>
        <div className="space-y-3">
          {team.members.map((member) => {
            const isCurrentUser = session?.user?.id === member.id;
            return (
              <div
                key={member.id}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg ${
                  isCurrentUser
                    ? "bg-blue-50 border-blue-300"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {member.image && (
                    <Image
                      src={member.image}
                      alt={member.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <div className="font-medium">
                      {member.name}
                      {isCurrentUser && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-800 rounded text-xs font-normal">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 break-all">
                      {member.email}
                    </div>
                    <div className="text-xs text-gray-500">
                      Joined {member.joinedAt.toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  {member.isAdmin ? (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                      Admin
                    </span>
                  ) : team.isAdmin ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handlePromote(member.id)}
                      disabled={promoteToAdmin.isPending}
                    >
                      Promote to Admin
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showInviteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Invite Members</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Addresses
                </label>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2">
                  {inviteEmails.map((email, index) => (
                    <Input
                      key={index}
                      type="email"
                      value={email}
                      onChange={(e) => handleEmailChange(index, e.target.value)}
                      placeholder="member@example.com"
                      disabled={sendingInvites}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowInviteDialog(false);
                    setInviteEmails([""]);
                  }}
                  disabled={sendingInvites}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={sendingInvites}>
                  {sendingInvites ? "Sending..." : "Send Invites"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Delete Team</h2>
            <p className="mb-6">
              Are you sure you want to delete this team? This action cannot be
              undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteTeam.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteTeam.isPending}
              >
                {deleteTeam.isPending ? "Deleting..." : "Delete Team"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Leave Team</h2>
            <p className="mb-6">
              Are you sure you want to leave this team? You will need to be
              re-invited to rejoin.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leaveTeam.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleLeave}
                disabled={leaveTeam.isPending}
              >
                {leaveTeam.isPending ? "Leaving..." : "Leave Team"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
