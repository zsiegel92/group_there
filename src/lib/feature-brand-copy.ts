import type { EventKind } from "@/db/schema";

export const COMMUTE_EVENT_KIND_LABEL = "Commute";
export const SHARED_DESTINATION_EVENT_KIND_LABEL = "Shared destination";
export const SHARED_DESTINATION_EVENT_KIND_SELECT_LABEL = "Shared Destination";
export const RECURRING_EVENT_TYPE_SUFFIX = " (recurring)";

export const PARTICIPANT_CHOSEN_DESTINATIONS_COPY =
  "Participants choose their own destinations";
export const NO_LOCATION_SET_COPY = "No location set";

export const EVENT_KIND_LABELS = {
  commute: COMMUTE_EVENT_KIND_LABEL,
  shared_destination: SHARED_DESTINATION_EVENT_KIND_LABEL,
} satisfies Record<EventKind, string>;

export const EVENT_KIND_SELECT_LABELS = {
  commute: COMMUTE_EVENT_KIND_LABEL,
  shared_destination: SHARED_DESTINATION_EVENT_KIND_SELECT_LABEL,
} satisfies Record<EventKind, string>;

export const EVENT_LOCATION_LABELS = {
  commute: "Destination:",
  shared_destination: "Where:",
} satisfies Record<EventKind, string>;

export const EVENT_LOCATION_EMAIL_LABELS = {
  commute: "Destination",
  shared_destination: "Where",
} satisfies Record<EventKind, string>;

export const EVENT_LOCATION_EMAIL_SUMMARY_LABELS = {
  commute: "Destinations",
  shared_destination: "Where",
} satisfies Record<EventKind, string>;
