const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmtDate = (iso: string) => { const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const fmtRange = (a: string, b: string) => `${fmtDate(a)} · ${fmtTime(a)} – ${fmtTime(b)}`;
/** "4:00 PM – 6:00 PM", or "4:00 PM – Sat, Oct 17 6:00 PM" when the event ends on another day. */
export const fmtTimeRange = (a: string, b: string) => {
  const sameDay = new Date(a).toDateString() === new Date(b).toDateString();
  return `${fmtTime(a)} – ${sameDay ? "" : `${dayLabel(b)} `}${fmtTime(b)}`;
};
export const peso = (s: string | number) => `₱${Number(s).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Compact peso for chart labels: ₱950, ₱1.2k, ₱15k. */
export const pesoShort = (n: number) => (n >= 1000 ? `₱${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `₱${Math.round(n)}`);
export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
const ROLE: Record<string, string> = { PRESIDENT: "President", VICE_PRESIDENT: "Vice President", SECRETARY: "Secretary", TREASURER: "Treasurer", AUDITOR: "Auditor", OFFICER: "Officer", ADVISER: "Adviser", MEMBER: "Member" };
export const roleLabel = (role: string, title?: string | null) => title || ROLE[role] || role.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** "Today", "Tomorrow", "Yesterday", "Fri, Oct 17". */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
/** "just now", "5m ago", "3h ago", then the date. */
export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h ago`;
  return dayLabel(iso);
}
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
