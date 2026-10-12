import { Icon } from "@/components/layout/icons";

// Product illustrations built from real UI pieces (no screenshots, no stock art). The figures are example data, labelled as
// such where a reader could mistake them for real numbers.

const bar = (h: number, on = false) => <span className={`w-full rounded-t-md ${on ? "bg-primary" : "bg-primary/25"}`} style={{ height: `${h}%` }} />;

/** A compact version of the officer dashboard, in a browser frame. */
export function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-20px_rgba(60,30,120,0.35)]" aria-hidden="true">
      <div className="flex items-center gap-2 border-b border-border bg-[#f8f7fc] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-muted ring-1 ring-border">tapasok / dashboard</span>
      </div>
      <div className="grid grid-cols-[150px_1fr] max-sm:grid-cols-1">
        <aside className="hidden flex-col gap-1 border-r border-border bg-sidebar p-3 sm:flex">
          {[["home", "Dashboard", true], ["calendar", "Events"], ["scan", "Attendance"], ["wallet", "Finance"], ["megaphone", "Announcements"], ["users", "Members"]].map(([icon, label, on]) => (
            <span key={label as string} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${on ? "bg-primary text-white" : "text-muted"}`}>
              <Icon name={icon as "home"} className="h-3.5 w-3.5" />{label as string}
            </span>
          ))}
        </aside>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted">Computer Science Society</p>
              <p className="text-sm font-semibold">Good afternoon, Maria</p>
            </div>
            <span className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">+ New event</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["Members", "248", "users"], ["Collected", "₱18,450", "wallet"], ["Check-ins today", "131", "check"]].map(([l, v, i]) => (
              <div key={l} className="rounded-xl border border-border p-2.5">
                <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon name={i as "users"} className="h-3.5 w-3.5" /></span>
                <p className="text-sm font-semibold tabular-nums">{v}</p>
                <p className="text-[10px] text-muted">{l}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2">
            <div className="rounded-xl border border-border p-3">
              <p className="mb-2 text-[11px] font-semibold">Check-ins per month</p>
              <div className="flex h-20 items-end gap-1.5">{bar(35)}{bar(52)}{bar(44)}{bar(70)}{bar(58)}{bar(92, true)}</div>
              <div className="mt-1 flex justify-between text-[9px] text-muted"><span>May</span><span>Oct</span></div>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
              <p className="text-[11px] font-semibold">To verify</p>
              {[["Carlo B.", "₱75.00"], ["Ana R.", "₱150.00"], ["Miguel T.", "₱150.00"]].map(([n, a]) => (
                <span key={n} className="flex items-center justify-between rounded-lg bg-[#f8f7fc] px-2 py-1 text-[10px]"><span>{n}</span><span className="font-semibold tabular-nums">{a}</span></span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Phone frame with the member's check-in confirmation. */
export function PhoneMockup({ variant = "checkin" }: { variant?: "checkin" | "home" }) {
  return (
    <div className="relative w-[230px] rounded-[2.2rem] border-[7px] border-[#1c2033] bg-[#1c2033] shadow-[0_30px_60px_-15px_rgba(28,32,51,0.45)]" aria-hidden="true">
      <div className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-[#1c2033]" />
      <div className="overflow-hidden rounded-[1.7rem] bg-background">
        <div className="bg-gradient-to-br from-[#3b1690] to-primary px-4 pb-5 pt-7 text-white">
          <p className="text-[10px] opacity-75">{variant === "checkin" ? "Attendance" : "Good morning,"}</p>
          <p className="text-base font-semibold">{variant === "checkin" ? "Scan to check in" : "Carlo"}</p>
        </div>
        {variant === "checkin" ? (
          <div className="flex flex-col items-center gap-2 px-4 pb-6 pt-5 text-center">
            <span className="relative flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-success/15" />
              <span className="absolute inset-3 rounded-full bg-success/20" />
              <Icon name="check" className="relative h-9 w-9 text-success" />
            </span>
            <p className="text-sm font-semibold">You&apos;re checked in</p>
            <p className="text-[10px] text-muted">General Assembly · Session 1</p>
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-semibold text-success">Recorded 4:02 PM</span>
            <span className="mt-3 w-full rounded-full bg-primary py-2 text-[11px] font-semibold text-white">Done</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <div className="rounded-xl bg-gradient-to-br from-[#3b1690] to-primary p-3 text-white">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[#e9ddff]">Attendance open now</p>
              <p className="text-xs font-semibold">General Assembly</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-border">
              <span className="flex h-9 w-8 flex-col items-center justify-center rounded-lg bg-primary-soft text-primary"><span className="text-[7px] font-bold">OCT</span><span className="text-xs font-bold leading-none">16</span></span>
              <span className="text-[10px]"><span className="block font-semibold">Leadership Seminar</span><span className="text-muted">Fri · 8:00 AM</span></span>
            </div>
            <div className="rounded-xl bg-white p-2.5 ring-1 ring-border">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">My attendance</p>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full"><span className="w-[70%] bg-success" /><span className="w-[15%] bg-warning" /><span className="w-[15%] bg-danger" /></div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-warning/10 p-2.5 text-[10px] text-warning"><span className="font-semibold">You owe ₱75.00</span><span>›</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Floating confirmation chip used over the hero visual. */
export function FloatingChip({ icon, title, sub, className = "" }: { icon: "check" | "wallet" | "scan"; title: string; sub: string; className?: string }) {
  const tone = icon === "check" ? "bg-success/10 text-success" : icon === "wallet" ? "bg-warning/10 text-warning" : "bg-primary-soft text-primary";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-border bg-white/95 px-3.5 py-2.5 shadow-[0_18px_40px_-12px_rgba(60,30,120,0.35)] backdrop-blur ${className}`} aria-hidden="true">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon name={icon} className="h-5 w-5" /></span>
      <span className="text-xs"><span className="block font-semibold text-foreground">{title}</span><span className="text-muted">{sub}</span></span>
    </div>
  );
}
