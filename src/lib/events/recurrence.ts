export const recurrenceFrequencyValues = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
] as const;

export type RecurrenceFrequency = (typeof recurrenceFrequencyValues)[number];

export function recurrenceRule(recurrence: {
  frequency: RecurrenceFrequency;
  count: number;
}) {
  if (recurrence.frequency === "none" || recurrence.count <= 1) return null;
  if (recurrence.frequency === "biweekly") {
    return `FREQ=WEEKLY;INTERVAL=2;COUNT=${recurrence.count}`;
  }
  return `FREQ=${recurrence.frequency.toUpperCase()};INTERVAL=1;COUNT=${recurrence.count}`;
}

export function addRecurrenceInterval(
  date: Date,
  frequency: RecurrenceFrequency,
  occurrenceIndex: number
) {
  const next = new Date(date);
  if (frequency === "daily") {
    next.setDate(next.getDate() + occurrenceIndex);
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + 7 * occurrenceIndex);
  } else if (frequency === "biweekly") {
    next.setDate(next.getDate() + 14 * occurrenceIndex);
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + occurrenceIndex);
  }
  return next;
}

export function parseRecurrenceFrequency(value: string): RecurrenceFrequency {
  if (value === "daily") return "daily";
  if (value === "weekly") return "weekly";
  if (value === "biweekly") return "biweekly";
  if (value === "monthly") return "monthly";
  return "none";
}
