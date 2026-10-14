// All school activity is in Philippine time (UTC+8, no daylight saving), independent of the server's time zone.
const TZ = "Asia/Manila";

export const formatDateTime = (d: Date) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);

export const formatDate = (d: Date) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: TZ }).format(d);

/** Time of day in school time, e.g. "2:05:33 PM" (seconds optional). */
export const formatTimeSeconds = (d: Date, seconds = true) =>
  new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: true, timeZone: TZ }).format(d);

export const formatPeso = (n: number | string | { toString(): string }) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(n.toString()));

/** <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm", Manila time) -> Date, or null if invalid. */
export function parseManilaLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date -> "YYYY-MM-DDTHH:mm" in Manila time, for datetime-local defaults. */
export function toManilaLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
  return parts.replace(" ", "T");
}

/** Default times for a new event: tomorrow 09:00-12:00 Manila time, attendance opening 30 minutes early. */
export function defaultEventTimes(now = Date.now()) {
  const start = new Date(now + 24 * 3600_000);
  start.setUTCHours(1, 0, 0, 0); // 09:00 in Manila
  const end = new Date(start.getTime() + 3 * 3600_000);
  return {
    startsAt: toManilaLocal(start), endsAt: toManilaLocal(end),
    attendanceOpensAt: toManilaLocal(new Date(start.getTime() - 30 * 60_000)), attendanceClosesAt: toManilaLocal(end),
  };
}

export function fieldErrorsOf(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const flat = error.flatten().fieldErrors;
  return Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])) as Record<string, string | undefined>;
}
