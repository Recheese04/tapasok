const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string) => { const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const fmtRange = (a: string, b: string) => `${fmtDate(a)} · ${fmtTime(a)} – ${fmtTime(b)}`;
export const peso = (s: string) => `₱${Number(s).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
const ROLE: Record<string, string> = { PRESIDENT: "President", VICE_PRESIDENT: "Vice President", SECRETARY: "Secretary", TREASURER: "Treasurer", OFFICER: "Officer", ADVISER: "Adviser", MEMBER: "Member" };
export const roleLabel = (role: string, title?: string | null) => title || ROLE[role] || role.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
