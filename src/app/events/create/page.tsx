"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useGroups } from "@/app/api/groups/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { useCreateEvent } from "../../api/events/client";

export default function CreateEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: groupsData, isLoading: groupsLoading } = useGroups();
  const createEvent = useCreateEvent();

  const groupIdParam = searchParams.get("groupId");
  const [groupId, setGroupId] = useState(groupIdParam || "");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");

  // Filter to only show groups where user is admin
  const adminGroups = groupsData?.groups.filter((gm) => gm.isAdmin) || [];

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!groupId || !name.trim() || !location.trim() || !time) return;

      try {
        const result = await createEvent.mutateAsync({
          groupId,
          name: name.trim(),
          location: location.trim(),
          time,
          message: message.trim() || undefined,
        });
        router.push(`/events/${result.event.id}`);
      } catch (error) {
        console.error("Failed to create event:", error);
        alert("Failed to create event. Please try again.");
      }
    },
    [groupId, name, location, time, message, createEvent, router]
  );

  if (groupsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner />
      </div>
    );
  }

  if (adminGroups.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Create an Event</h1>
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">
            You need to be an admin of a group to create events.
          </p>
          <Button onClick={() => router.push("/groups")}>Go to Groups</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">Create an Event</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="groupId" className="block text-sm font-medium mb-2">
            Group *
          </label>
          <select
            id="groupId"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full p-2 border rounded"
            required
            disabled={createEvent.isPending}
          >
            <option value="">Select a group</option>
            {adminGroups.map((groupMembership) => (
              <option
                key={groupMembership.group.id}
                value={groupMembership.group.id}
              >
                {groupMembership.group.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Event Name *
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter event name"
            required
            maxLength={200}
            disabled={createEvent.isPending}
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium mb-2">
            Location *
          </label>
          <Input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Enter event location"
            required
            maxLength={500}
            disabled={createEvent.isPending}
          />
        </div>

        <div>
          <label htmlFor="time" className="block text-sm font-medium mb-2">
            Date & Time *
          </label>
          <Input
            id="time"
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            disabled={createEvent.isPending}
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-2">
            Message (optional)
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add any additional details about the event"
            className="w-full p-2 border rounded"
            rows={4}
            maxLength={2000}
            disabled={createEvent.isPending}
          />
        </div>

        {createEvent.isError && (
          <div className="text-red-600 text-sm">
            Failed to create event. Please try again.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={
              createEvent.isPending ||
              !groupId ||
              !name.trim() ||
              !location.trim() ||
              !time
            }
          >
            {createEvent.isPending ? "Creating..." : "Create Event"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/events")}
            disabled={createEvent.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
