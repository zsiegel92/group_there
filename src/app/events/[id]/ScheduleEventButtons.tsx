"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  useScheduleEvent,
  useUnscheduleEvent,
} from "../../api/events/client";

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

  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);
  const [showUnscheduleConfirm, setShowUnscheduleConfirm] = useState(false);

  const handleSchedule = useCallback(async () => {
    try {
      await scheduleEvent.mutateAsync(eventId);
      setShowScheduleConfirm(false);
      alert("Event scheduled successfully!");
    } catch (error) {
      console.error("Failed to schedule event:", error);
      alert("Failed to schedule event. Please try again.");
    }
  }, [eventId, scheduleEvent]);

  const handleUnschedule = useCallback(async () => {
    try {
      await unscheduleEvent.mutateAsync(eventId);
      setShowUnscheduleConfirm(false);
      alert("Event unscheduled successfully!");
    } catch (error) {
      console.error("Failed to unschedule event:", error);
      alert("Failed to unschedule event. Please try again.");
    }
  }, [eventId, unscheduleEvent]);

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

      {showScheduleConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
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
              >
                {scheduleEvent.isPending ? "Scheduling..." : "Schedule Event"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showUnscheduleConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Unschedule Event</h2>
            <p className="mb-6">
              This will hide the event from group members. They will not be able
              to join until you schedule it again.
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
              >
                {unscheduleEvent.isPending
                  ? "Unscheduling..."
                  : "Unschedule Event"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
