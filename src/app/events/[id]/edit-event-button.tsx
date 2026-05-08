"use client";

import { useCallback, useState } from "react";
import { format } from "date-fns";

import { AddressSelectorAndCard } from "@/components/address-selector-and-card";
import { useDialog } from "@/components/dialog-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EventKind } from "@/db/schema";
import type { Location } from "@/lib/geo/schema";

import { useUpdateEvent } from "../../api/events/client";

type Event = {
  kind: EventKind;
  name: string;
  locationId: string | null;
  location: Location | null;
  time: string;
  message: string | null;
};

function parseEventKind(value: string): EventKind {
  return value === "commute" ? "commute" : "shared_destination";
}

type EditEventButtonProps = {
  event: Event;
  eventId: string;
};

export function EditEventButton({ event, eventId }: EditEventButtonProps) {
  const updateEvent = useUpdateEvent();
  const dialog = useDialog();

  const [showEditForm, setShowEditForm] = useState(false);
  const [editKind, setEditKind] = useState<EventKind>("shared_destination");
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editMessage, setEditMessage] = useState("");

  const openEditForm = useCallback(() => {
    setEditKind(event.kind);
    setEditName(event.name);
    setEditLocation(event.location);
    // Convert ISO string to datetime-local format
    setEditTime(format(new Date(event.time), "yyyy-MM-dd'T'HH:mm"));
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
            kind: editKind !== event.kind ? editKind : undefined,
            name: editName !== event.name ? editName : undefined,
            locationId:
              editKind === "commute"
                ? event.locationId
                  ? null
                  : undefined
                : editLocation?.id !== event.locationId
                  ? (editLocation?.id ?? undefined)
                  : undefined,
            time: editTime !== event.time ? editTime : undefined,
            message:
              editMessage !== (event.message || "") ? editMessage : undefined,
          },
        });
        setShowEditForm(false);
        dialog.alert("Event updated successfully!");
      } catch (error) {
        console.error("Failed to update event:", error);
        dialog.alert("Failed to update event. Please try again.");
      }
    },
    [
      event,
      eventId,
      editKind,
      editName,
      editLocation,
      editTime,
      editMessage,
      updateEvent,
      dialog,
    ]
  );

  return (
    <>
      <Button onClick={openEditForm} size="sm">
        Edit Event
      </Button>

      <Dialog
        open={showEditForm}
        onClose={() => {
          if (!updateEvent.isPending) setShowEditForm(false);
        }}
        className="max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-bold mb-4">Edit Event</h2>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={editKind}
              onChange={(e) => {
                const nextKind = parseEventKind(e.target.value);
                setEditKind(nextKind);
                if (nextKind === "commute") setEditLocation(null);
              }}
              className="w-full p-2 border rounded"
              required
            >
              <option value="shared_destination">Shared Destination</option>
              <option value="commute">Commute</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>
          {editKind === "shared_destination" && (
            <div>
              <label className="block text-sm font-medium mb-2">Location</label>
              <AddressSelectorAndCard
                onNewValidatedLocation={setEditLocation}
                ownerType="event"
                ownerId={eventId}
                selectedLocation={editLocation}
              />
            </div>
          )}
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
      </Dialog>
    </>
  );
}
