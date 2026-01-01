"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useUpdateEvent } from "../../api/events/client";

type Event = {
  name: string;
  location: string;
  time: string;
  message: string | null;
};

type EditEventButtonProps = {
  event: Event;
  eventId: string;
};

export function EditEventButton({ event, eventId }: EditEventButtonProps) {
  const updateEvent = useUpdateEvent();

  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editMessage, setEditMessage] = useState("");

  const openEditForm = useCallback(() => {
    setEditName(event.name);
    setEditLocation(event.location);
    // Convert ISO string to datetime-local format
    const timeDate = new Date(event.time);
    const year = timeDate.getFullYear();
    const month = String(timeDate.getMonth() + 1).padStart(2, "0");
    const day = String(timeDate.getDate()).padStart(2, "0");
    const hours = String(timeDate.getHours()).padStart(2, "0");
    const minutes = String(timeDate.getMinutes()).padStart(2, "0");
    setEditTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    setEditMessage(event.message || "");
    setShowEditForm(true);
  }, [event]);

  const handleEditSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      try {
        await updateEvent.mutateAsync({
          eventId,
          input: {
            name: editName !== event.name ? editName : undefined,
            location:
              editLocation !== event.location ? editLocation : undefined,
            time: editTime !== event.time ? editTime : undefined,
            message:
              editMessage !== (event.message || "") ? editMessage : undefined,
          },
        });
        setShowEditForm(false);
        alert("Event updated successfully!");
      } catch (error) {
        console.error("Failed to update event:", error);
        alert("Failed to update event. Please try again.");
      }
    },
    [event, eventId, editName, editLocation, editTime, editMessage, updateEvent]
  );

  return (
    <>
      <Button onClick={openEditForm} size="sm">
        Edit Event
      </Button>

      {showEditForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Event</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Location
                </label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Date & Time
                </label>
                <Input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Message (optional)
                </label>
                <textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  className="w-full p-2 border rounded"
                  rows={4}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowEditForm(false)}
                  disabled={updateEvent.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
