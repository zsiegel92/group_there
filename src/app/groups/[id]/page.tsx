"use client";

import { use, useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { useDialog } from "@/components/dialog-provider";
import { AdminBadge, YouBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";

import {
  useDeleteGroup,
  useGroupDetails,
  useInviteToGroup,
  useLeaveGroup,
  usePromoteToAdmin,
} from "../../api/groups/client";
import { EventsPage } from "../../events/events-page";

export default function GroupDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const groupId = params.id;
  const { data: session } = useSession();
  const dialog = useDialog();

  const { data, isLoading, error, refetch } = useGroupDetails(groupId);
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();
  const inviteToGroup = useInviteToGroup();
  const promoteToAdmin = usePromoteToAdmin();

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([""]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);

  const handleEmailChange = useCallback(
    (index: number, value: string) => {
      const newEmails = [...inviteEmails];
      newEmails[index] = value;

      // Filter out all empty strings and add exactly one at the end
      const nonEmpty = newEmails.filter((email) => email.trim() !== "");
      setInviteEmails([...nonEmpty, ""]);
    },
    [inviteEmails]
  );

  const handleInvite = useCallback(
    async (e: React.FormEvent) => {
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
          validEmails.map((email) =>
            inviteToGroup.mutateAsync({ groupId, email })
          )
        );
        setInviteEmails([""]);
        setShowInviteDialog(false);
        dialog.alert(
          `Invite${validEmails.length > 1 ? "s" : ""} sent successfully to ${validEmails.length} email${validEmails.length > 1 ? "s" : ""}!`
        );
      } catch (error) {
        console.error("Failed to send invites:", error);
        dialog.alert("Failed to send some invites. Please try again.");
      } finally {
        setSendingInvites(false);
      }
    },
    [inviteEmails, inviteToGroup, groupId, dialog]
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteGroup.mutateAsync(groupId);
      router.push("/groups");
    } catch (error) {
      console.error("Failed to delete group:", error);
      dialog.alert("Failed to delete group. Please try again.");
    }
  }, [groupId, deleteGroup, router, dialog]);

  const handleLeave = useCallback(async () => {
    try {
      await leaveGroup.mutateAsync(groupId);
      router.push("/groups");
    } catch (error) {
      console.error("Failed to leave group:", error);
      dialog.alert("Failed to leave group. Please try again.");
    }
  }, [groupId, leaveGroup, router, dialog]);

  const handlePromote = useCallback(
    async (userId: string) => {
      try {
        await promoteToAdmin.mutateAsync({ groupId, userId });
        refetch();
      } catch (error) {
        console.error("Failed to promote user:", error);
        dialog.alert("Failed to promote user. Please try again.");
      }
    },
    [groupId, promoteToAdmin, refetch, dialog]
  );

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
        <div className="text-red-600">Error loading group: {error.message}</div>
      </div>
    );
  }

  const groupDetail = data?.group;
  if (!groupDetail) return null;

  // Find current user's membership to determine admin status
  const currentUserMembership = groupDetail.members.find(
    (m) => m.user.id === session?.user?.id
  );
  const isAdmin = currentUserMembership?.isAdmin ?? false;

  // Check if the current user is the only admin
  const adminCount = groupDetail.members.filter((m) => m.isAdmin).length;
  const isOnlyAdmin = isAdmin && adminCount === 1;
  const isTesting = groupDetail.group.type === "testing";
  const visibleMembers = groupDetail.members.filter((m) => !m.user.isTestUser);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold">
            {groupDetail.group.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <Link href={`/events/create?groupId=${groupId}`}>
                  <Button size="sm" className="sm:h-10">
                    Create Event
                  </Button>
                </Link>
                {!isTesting && (
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
                      Delete Group
                    </Button>
                  </>
                )}
              </>
            )}
            {!isTesting && (
              <Button
                variant="destructive"
                onClick={() => setShowLeaveConfirm(true)}
                disabled={isOnlyAdmin}
                size="sm"
                className="sm:h-10"
                title={
                  isOnlyAdmin
                    ? "You cannot leave the group as the only admin. Promote another member to admin first or delete the group."
                    : undefined
                }
              >
                Leave Group
              </Button>
            )}
          </div>
        </div>
        {isAdmin && <AdminBadge>You are an admin</AdminBadge>}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">
          Members ({visibleMembers.length})
        </h2>
        <div className="space-y-3">
          {visibleMembers.map((membershipInfo) => {
            const isCurrentUser = session?.user?.id === membershipInfo.user.id;
            return (
              <div
                key={membershipInfo.user.id}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg ${
                  isCurrentUser
                    ? "bg-blue-50 border-blue-300"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {membershipInfo.user.image && (
                    <Image
                      src={membershipInfo.user.image}
                      alt={membershipInfo.user.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <div className="font-medium">
                      {membershipInfo.user.name}
                      {isCurrentUser && (
                        <span className="ml-2">
                          <YouBadge />
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 break-all">
                      {membershipInfo.user.email}
                    </div>
                    <div className="text-xs text-gray-500">
                      Joined {format(membershipInfo.joinedAt, "MM/dd/yyyy")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  {membershipInfo.isAdmin ? (
                    <AdminBadge />
                  ) : isAdmin && !isTesting ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handlePromote(membershipInfo.user.id)}
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

      <div className="mt-8">
        <EventsPage groupId={groupId} />
      </div>

      <Dialog
        open={showInviteDialog}
        onClose={() => {
          if (!sendingInvites) {
            setShowInviteDialog(false);
            setInviteEmails([""]);
          }
        }}
      >
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
            <Button type="submit" disabled={sendingInvites} data-autofocus>
              {sendingInvites ? "Sending..." : "Send Invites"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        onClose={() => {
          if (!deleteGroup.isPending) setShowDeleteConfirm(false);
        }}
      >
        <h2 className="text-xl font-bold mb-4">Delete Group</h2>
        <p className="mb-6">
          Are you sure you want to delete this group? This action cannot be
          undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={deleteGroup.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteGroup.isPending}
            data-autofocus
          >
            {deleteGroup.isPending ? "Deleting..." : "Delete Group"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={showLeaveConfirm}
        onClose={() => {
          if (!leaveGroup.isPending) setShowLeaveConfirm(false);
        }}
      >
        <h2 className="text-xl font-bold mb-4">Leave Group</h2>
        <p className="mb-6">
          Are you sure you want to leave this group? You will need to be
          re-invited to rejoin.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowLeaveConfirm(false)}
            disabled={leaveGroup.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={leaveGroup.isPending}
            data-autofocus
          >
            {leaveGroup.isPending ? "Leaving..." : "Leave Group"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
