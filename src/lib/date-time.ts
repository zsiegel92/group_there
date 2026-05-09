import { format } from "date-fns";

export function formatDatetimeLocal(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function datetimeLocalToIso(datetimeLocal: string) {
  return new Date(datetimeLocal).toISOString();
}
