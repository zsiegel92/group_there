"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { useDialog } from "@/components/dialog-provider";
import { Button } from "@/components/ui/button";

import { useSendBlast, type EventDetail } from "../../api/events/client";

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
  const dialog = useDialog();

  const handleBlast = async (type: "event_scheduled" | "event_confirmed") => {
    const message =
      type === "event_scheduled"
        ? "Send email to all group members who haven't joined yet?"
        : "Send confirmation email to all attendees?";

    const confirmed = await dialog.confirm(message);
    if (!confirmed) return;

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
    <div className="mt-3 border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {showScheduledButton && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBlast("event_scheduled")}
            disabled={sendBlast.isPending}
          >
            {sendBlast.isPending ? "Sending..." : "Notify Group to Join"}
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
      <div className="max-h-32 overflow-y-auto">
        {event.blasts.length > 0 ? (
          <div className="space-y-1">
            {event.blasts.map((blast) => (
              <div key={blast.id} className="text-xs text-gray-500 flex gap-2">
                <span>
                  {blast.type in blastTypeLabels
                    ? blastTypeLabels[blast.type]
                    : blast.type}
                </span>
                <span>({blast.recipientCount} recipients)</span>
                <span>
                  {formatDistanceToNow(new Date(blast.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No notifications sent yet</p>
        )}
      </div>
    </div>
  );
}
