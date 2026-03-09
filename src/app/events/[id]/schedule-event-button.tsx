"use client";

import { useCallback, useState } from "react";

import { useDialog } from "@/components/dialog-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import { useScheduleEvent, useUnscheduleEvent } from "../../api/events/client";

type ScheduleEventButtonsProps = {
  eventId: string;
  isScheduled: boolean;
};

export function ScheduleEventButtons({
  eventId,
  isScheduled,
}: ScheduleEventButtonsProps) {
  const scheduleEvent = useScheduleEvent();
  const unscheduleEvent = useUnscheduleEvent();
  const dialog = useDialog();

  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);
  const [showUnscheduleConfirm, setShowUnscheduleConfirm] = useState(false);

  const handleSchedule = useCallback(async () => {
    try {
      await scheduleEvent.mutateAsync(eventId);
      setShowScheduleConfirm(false);
      dialog.alert("Event scheduled successfully!");
    } catch (error) {
      console.error("Failed to schedule event:", error);
      dialog.alert("Failed to schedule event. Please try again.");
    }
  }, [eventId, scheduleEvent, dialog]);

  const handleUnschedule = useCallback(async () => {
    try {
      await unscheduleEvent.mutateAsync(eventId);
      setShowUnscheduleConfirm(false);
      dialog.alert("Event unscheduled successfully!");
    } catch (error) {
      console.error("Failed to unschedule event:", error);
      dialog.alert("Failed to unschedule event. Please try again.");
    }
  }, [eventId, unscheduleEvent, dialog]);

  return (
    <>
      {isScheduled ? (
        <Button
          variant="secondary"
          onClick={() => setShowUnscheduleConfirm(true)}
          size="sm"
        >
          Unschedule
        </Button>
      ) : (
        <Button onClick={() => setShowScheduleConfirm(true)} size="sm">
          Schedule Event
        </Button>
      )}

      <Dialog
        open={showScheduleConfirm}
        onClose={() => {
          if (!scheduleEvent.isPending) setShowScheduleConfirm(false);
        }}
      >
        <h2 className="text-xl font-bold mb-4">Schedule Event</h2>
        <p className="mb-6">
          This will make the event visible to all group members and they can
          start joining.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowScheduleConfirm(false)}
            disabled={scheduleEvent.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={scheduleEvent.isPending}
            data-autofocus
          >
            {scheduleEvent.isPending ? "Scheduling..." : "Schedule Event"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={showUnscheduleConfirm}
        onClose={() => {
          if (!unscheduleEvent.isPending) setShowUnscheduleConfirm(false);
        }}
      >
        <h2 className="text-xl font-bold mb-4">Unschedule Event</h2>
        <p className="mb-6">
          This will hide the event from group members. They will not be able to
          join until you schedule it again.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowUnscheduleConfirm(false)}
            disabled={unscheduleEvent.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUnschedule}
            disabled={unscheduleEvent.isPending}
            data-autofocus
          >
            {unscheduleEvent.isPending ? "Unscheduling..." : "Unschedule Event"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
