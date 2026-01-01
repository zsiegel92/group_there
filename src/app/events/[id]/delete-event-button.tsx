"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { useDeleteEvent } from "../../api/events/client";

type DeleteEventButtonProps = {
  eventId: string;
};

export function DeleteEventButton({ eventId }: DeleteEventButtonProps) {
  const router = useRouter();
  const deleteEvent = useDeleteEvent();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = useCallback(async () => {
    try {
      await deleteEvent.mutateAsync(eventId);
      router.push("/events");
    } catch (error) {
      console.error("Failed to delete event:", error);
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  }, [eventId, deleteEvent, router]);

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setShowDeleteConfirm(true)}
        size="sm"
      >
        Delete
      </Button>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Delete Event</h2>
            <p className="mb-6">
              Are you sure you want to delete this event? This action cannot be
              undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteEvent.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteEvent.isPending}
              >
                {deleteEvent.isPending ? "Deleting..." : "Delete Event"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
