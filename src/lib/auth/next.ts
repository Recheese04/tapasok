// Only same-site paths from this allowlist can be used after sign-in (no open redirects).
const NEXT_ALLOWED = ["/check-in", "/dashboard", "/events", "/attendance", "/join"];

export function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 500) return "/dashboard";
  const path = v.split(/[?#]/)[0];
  return NEXT_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`)) ? v : "/dashboard";
}
