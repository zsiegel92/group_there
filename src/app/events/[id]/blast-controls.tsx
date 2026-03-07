"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  useSendBlast,
  type EventDetail,
} from "../../api/events/client";

function timeAgo(dateStr: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const blastTypeLabels = {
  event_scheduled: "Notified group to join",
  event_confirmed: "Sent confirmation emails",
} as const;

export function BlastControls({
  event,
  eventId,
}: {
  event: EventDetail;
  eventId: string;
}) {
  const sendBlast = useSendBlast();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleBlast = (type: "event_scheduled" | "event_confirmed") => {
    const message =
      type === "event_scheduled"
        ? "Send email to all group members who haven't joined yet?"
        : "Send confirmation email to all attendees?";

    if (!confirm(message)) return;

    sendBlast.mutate(
      { eventId, type },
      {
        onSuccess: (data) => {
          setSuccessMessage(`Sent to ${data.recipientCount} recipients`);
          setTimeout(() => setSuccessMessage(null), 3000);
        },
      }
    );
  };

  const showScheduledButton = event.scheduled && !event.locked;
  const showConfirmedButton = event.locked;

  if (!showScheduledButton && !showConfirmedButton) return null;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-3">
        {showScheduledButton && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBlast("event_scheduled")}
            disabled={sendBlast.isPending}
          >
            {sendBlast.isPending
              ? "Sending..."
              : "Notify Group to Join"}
          </Button>
        )}
        {showConfirmedButton && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBlast("event_confirmed")}
            disabled={sendBlast.isPending}
          >
            {sendBlast.isPending
              ? "Sending..."
              : "Notify Attendees with Confirmation"}
          </Button>
        )}
        {successMessage && (
          <span className="text-sm text-green-600">{successMessage}</span>
        )}
        {sendBlast.isError && (
          <span className="text-sm text-red-600">
            {sendBlast.error.message}
          </span>
        )}
      </div>

      {/* Blast History */}
      {event.blasts.length > 0 && (
        <div className="max-h-32 overflow-y-auto">
          <div className="space-y-1">
            {event.blasts.map((blast) => (
              <div
                key={blast.id}
                className="text-xs text-gray-500 flex gap-2"
              >
                <span>
                  {blastTypeLabels[blast.type as keyof typeof blastTypeLabels] ??
                    blast.type}
                </span>
                <span>({blast.recipientCount} recipients)</span>
                <span>{timeAgo(blast.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {event.blasts.length === 0 && (
        <p className="text-xs text-gray-400">No notifications sent yet</p>
      )}
    </div>
  );
}
