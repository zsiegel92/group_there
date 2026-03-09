import { format } from "date-fns";

import type { Location } from "@/lib/geo/schema";

export function EventDetailsCard({
  time,
  location,
  message,
}: {
  time: string;
  location: Location | null;
  message: string | null;
}) {
  const eventDate = new Date(time);

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Event Details</h2>
      <div className="space-y-2 text-gray-700">
        <div>
          <span className="font-medium">When:</span>{" "}
          {format(eventDate, "MM/dd/yyyy")} at {format(eventDate, "h:mm a")}
        </div>
        <div>
          <span className="font-medium">Where:</span>{" "}
          {location ? (
            <span>
              {location.name}
              {location.addressString && (
                <span className="text-gray-500 text-sm ml-1">
                  ({location.addressString})
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">No location set</span>
          )}
        </div>
        {message && (
          <div>
            <span className="font-medium">Message:</span>
            <p className="mt-1">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
