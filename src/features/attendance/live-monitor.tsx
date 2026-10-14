"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/shared/ui";
import { liveSessionAction } from "./live-actions";
import type { LiveCheckIn, LiveData, LiveRejection } from "./live";

const POLL_MS = 2000;
const SPOTLIGHT_MS = 12_000; // a tap stays in the spotlight this long
const MAX_SPOTS = 4; // during a rush, the last few taps are shown side by side so every face can be checked
const SOURCE: Record<string, string> = { RFID: "RFID card", QR_SELF: "QR check-in", OFFICER_SCAN: "Officer scan", MANUAL: "Manual entry" };
const STATE: Record<string, { tone: string; title: string; text: string }> = {
  open: { tone: "border-success/30 bg-success/10 text-success", title: "Check-in is open", text: "Cards tapped on this organization's readers are recorded here." },
  not_activated: { tone: "border-warning/30 bg-warning/10 text-warning", title: "Check-in is closed", text: "No attendance is open. Click Activate scanner on the event (or Open in the app) to start." },
  not_started: { tone: "border-border bg-sidebar text-muted", title: "Not open yet", text: "This session has not reached its opening time." },
  ended: { tone: "border-border bg-sidebar text-muted", title: "Session ended", text: "Its check-in time is over." },
  finalized: { tone: "border-border bg-sidebar text-muted", title: "Session finalized", text: "Attendance is closed and absences were recorded." },
  unpublished: { tone: "border-warning/30 bg-warning/10 text-warning", title: "Event not published", text: "Publish the event before check-in." },
};

const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

/** Student photo with a clean initials avatar when there is none or it fails to load. */
function Photo({ userId, name, hasPhoto, version, size }: { userId: string; name: string; hasPhoto: boolean; version?: number | null; size: "lg" | "md" | "sm" }) {
  const src = `/users/${userId}/photo?v=${version ?? 0}`;
  // A failure is remembered per picture version, so a newly changed picture is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const initials = name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const cls = size === "lg" ? "h-28 w-28 rounded-3xl text-3xl sm:h-32 sm:w-32" : size === "md" ? "h-20 w-20 rounded-2xl text-xl" : "h-10 w-10 rounded-xl text-sm";
  if (hasPhoto && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- authorized, private photo route (not optimizable)
    return <img src={src} alt={`Photo of ${name}`} onError={() => setFailedSrc(src)} className={`${cls} shrink-0 object-cover ring-2 ring-surface`} />;
  }
  return <span aria-hidden="true" className={`${cls} flex shrink-0 items-center justify-center bg-primary-soft font-semibold text-primary`}>{initials || "?"}</span>;
}

type Spot = { kind: "in"; item: LiveCheckIn } | { kind: "rejected"; item: LiveRejection };
type Shown = Spot & { shownAt: number };

/** One tap in the spotlight: large when it is alone, compact when several arrived together. */
function SpotCard({ spot, big, latest, context }: { spot: Shown; big: boolean; latest: boolean; context: string }) {
  if (spot.kind === "rejected") {
    const r = spot.item;
    return (
      <div className={`flex flex-col items-center gap-2 rounded-2xl text-center ${big ? "" : "border border-danger/30 bg-danger/5 p-3"}`}>
        <span className={`flex items-center justify-center rounded-2xl bg-danger/10 text-danger ${big ? "h-16 w-16 text-3xl" : "h-10 w-10 text-xl"}`} aria-hidden="true">!</span>
        <p className={`font-semibold text-danger ${big ? "text-xl" : "text-sm"}`}>Not recorded{latest && !big ? " · latest" : ""}</p>
        <p className={big ? "text-base" : "text-sm"}>{r.message}</p>
        <p className="text-xs text-muted">{r.name ? `${r.name}${r.studentNumber ? ` · ${r.studentNumber}` : ""} · ` : ""}{r.cardTail ? `Card ••••${r.cardTail} · ` : ""}{r.device} · <span className="tabular-nums">{r.time}</span></p>
      </div>
    );
  }
  const c = spot.item;
  const status = <Badge tone={c.status === "LATE" ? "amber" : "green"}>{c.status === "LATE" ? "LATE" : "PRESENT"}</Badge>;
  if (big) {
    return (
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <Photo userId={c.userId} name={c.name} hasPhoto={c.hasPhoto} version={c.photoVersion} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <span>{status}</span>
          <p className="break-words text-2xl font-semibold sm:text-3xl">{c.name}</p>
          <p className="text-base tabular-nums text-muted">{c.studentNumber ?? "No student number"}{c.program ? ` · ${c.program}` : ""}{c.yearLevel ? ` · Year ${c.yearLevel}` : ""}</p>
          <p className="text-sm"><span className="font-semibold tabular-nums">{c.time}</span> <span className="text-muted">· {SOURCE[c.source] ?? c.source} · {context}</span></p>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${latest ? "border-primary/40 bg-primary-soft/30" : "border-border"}`}>
      <Photo userId={c.userId} name={c.name} hasPhoto={c.hasPhoto} version={c.photoVersion} size="md" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">{status}{latest ? <span className="text-xs font-medium text-primary">Latest</span> : null}</span>
        <p className="truncate text-base font-semibold">{c.name}</p>
        <p className="truncate text-xs tabular-nums text-muted">{c.studentNumber ?? "No student number"}{c.program ? ` · ${c.program}` : ""}{c.yearLevel ? ` · Year ${c.yearLevel}` : ""}</p>
        <p className="text-sm font-semibold tabular-nums">{c.time}</p>
      </div>
    </div>
  );
}

/**
 * Live attendance for one session: the latest tap large (photo, name, number, status, time), a feed of check-ins (newest
 * first, one entry per saved record), refused taps, and totals from the database. Polls every 2 seconds while visible.
 */
export function LiveMonitor({ initial }: { initial: LiveData }) {
  const [data, setData] = useState<LiveData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [spots, setSpots] = useState<Shown[]>([]);
  // Everything already on screen when the monitor opened is history, not a new tap.
  const seen = useRef(new Set([...initial.checkIns.map((c) => c.id), ...initial.rejections.map((r) => r.id)]));
  const inFlight = useRef(false);
  const sessionId = initial.session.id;

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await liveSessionAction(sessionId);
      if (!next) { setError("You no longer have access to this session."); return; }
      setError(null);
      // New items, newest first, go into the spotlight (several at once during a rush).
      const fresh: Spot[] = [
        ...next.checkIns.filter((c) => !seen.current.has(c.id)).map((item): Spot => ({ kind: "in", item })),
        ...next.rejections.filter((r) => !seen.current.has(r.id)).map((item): Spot => ({ kind: "rejected", item })),
      ].sort((a, b) => b.item.at.localeCompare(a.item.at));
      for (const f of fresh) seen.current.add(f.item.id);
      if (fresh.length) {
        const at = Date.now();
        setSpots((prev) => [...fresh.map((f) => ({ ...f, shownAt: at })), ...prev].slice(0, MAX_SPOTS));
      }
      setData(next);
    } catch {
      setError("Connection problem. Retrying…");
    } finally {
      inFlight.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); if (document.visibilityState === "visible") void poll(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [poll]);

  const visible = spots.filter((s) => now - s.shownAt < SPOTLIGHT_MS);
  const state = STATE[data.session.state];
  const t = data.totals;
  const checkedIn = t.present + t.late;
  // Merge by record id so a check-in appears once, however many polls returned it.
  const feed = useMemo(() => [...new Map(data.checkIns.map((c) => [c.id, c])).values()].sort((a, b) => b.at.localeCompare(a.at)), [data.checkIns]);

  return (
    <div className="flex flex-col gap-5">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${state.tone}`} role="status">
        <div className="flex items-center gap-3">
          {data.session.state === "open" ? <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-3 w-3 rounded-full bg-success" /></span> : <span className="h-3 w-3 rounded-full bg-current opacity-50" />}
          <div>
            <p className="font-semibold">{state.title}</p>
            <p className="text-sm opacity-90">{state.text}</p>
          </div>
        </div>
        <p className="text-sm text-foreground">{data.session.window} · Late after {data.session.lateAfter}</p>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => void poll()} className="font-medium underline">Retry now</button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Spotlight: the latest tap, large enough to check the face against the person */}
        <section aria-label="Latest taps" aria-live="polite" className="flex min-h-64 flex-col justify-center rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6">
          {visible.length === 1 ? (
            <SpotCard spot={visible[0]} big latest context={`${data.event.title} · ${data.session.label}`} />
          ) : visible.length > 1 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-muted">{visible.length} taps just now, newest first</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((s, i) => <SpotCard key={s.item.id} spot={s} big={false} latest={i === 0} context="" />)}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-muted">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h4M7 14h7" /><path d="M16.5 9.5a3 3 0 0 1 0 5M18.5 8a5.5 5.5 0 0 1 0 8" /></svg>
              <p className="text-lg font-medium text-foreground">{data.session.state === "open" ? "Waiting for the next tap…" : "No check-ins are being taken"}</p>
              <p className="text-sm">Each successful tap appears here with the student&apos;s photo, number and time.</p>
            </div>
          )}
        </section>

        {/* Totals from the database */}
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 self-start">
          {[
            ["Checked in", `${checkedIn}`, t.expected ? `of ${t.expected} expected` : "", "text-primary"],
            ["Present", `${t.present}`, "on time", "text-success"],
            ["Late", `${t.late}`, `after ${data.session.lateAfter}`, "text-warning"],
            ["Not yet", `${Math.max(0, t.expected - checkedIn - t.excused)}`, t.absent ? `${t.absent} marked absent` : "expected, no record", "text-muted"],
          ].map(([label, value, hint, color]) => (
            <div key={label} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <p className={`text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted">{hint}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
            <p className="mb-1 font-medium">RFID terminals</p>
            {data.terminals.length === 0 ? <p className="text-muted">None registered. QR check-in still works.</p> : (
              <ul className="flex flex-col gap-0.5">{data.terminals.map((d) => <li key={d.name} className="flex justify-between gap-2"><span>{d.name}</span><span className="text-muted">last tap {ago(d.lastSeenAt, now)}</span></li>)}</ul>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="feed-title" className="rounded-2xl border border-border bg-surface shadow-card">
          <h2 id="feed-title" className="px-5 pt-4 font-semibold">Recent check-ins <span className="text-sm font-normal text-muted">(newest first)</span></h2>
          {feed.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No check-ins yet.</p> : (
            <ul className="divide-y divide-border p-2">
              {feed.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Photo userId={c.userId} name={c.name} hasPhoto={c.hasPhoto} version={c.photoVersion} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted">{c.studentNumber ?? "—"}{c.program ? ` · ${c.program}` : ""}{c.yearLevel ? ` · Year ${c.yearLevel}` : ""} · {SOURCE[c.source] ?? c.source}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={c.status === "LATE" ? "amber" : "green"}>{c.status === "LATE" ? "Late" : "Present"}</Badge>
                    <span className="text-xs tabular-nums text-muted">{c.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="rej-title" className="self-start rounded-2xl border border-border bg-surface shadow-card">
          <h2 id="rej-title" className="px-5 pt-4 font-semibold">Taps not recorded</h2>
          {data.rejections.length === 0 ? <p className="px-5 py-6 text-sm text-muted">None in the last 30 minutes.</p> : (
            <ul className="divide-y divide-border p-2 text-sm">
              {data.rejections.map((r) => (
                <li key={r.id} className="px-3 py-2">
                  <p className="font-medium text-danger">{r.message}</p>
                  <p className="text-xs text-muted">{r.name ? `${r.name} · ` : ""}{r.cardTail ? `Card ••••${r.cardTail} · ` : ""}{r.device} · <span className="tabular-nums">{r.time}</span></p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-muted">Updates every 2 seconds. Times are Philippine time. <Link href={`/events/${data.event.id}/sessions/${data.session.id}`} className="text-primary hover:underline">Full attendance list</Link></p>
    </div>
  );
}
