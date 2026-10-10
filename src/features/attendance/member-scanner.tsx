"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/shared/ui";
import { formatDateTime } from "@/lib/format";
import { selfCheckInAction, type ScanActionResult } from "./actions";
import { QrCamera } from "./qr-camera";
import { ResultBanner } from "./scanner";

export type SessionCard = {
  id: string; label: string; opensAt: string; closesAt: string;
  state: "open" | "not_active" | "opens_later" | "closed" | "checked_in";
  myStatus: string | null;
  event: { id: string; title: string; venue: string; startsAt: string; endsAt: string; organization: string };
};

const STATE_TEXT = {
  open: ["Open now", "green"], not_active: ["Waiting for an officer to open it", "amber"], opens_later: ["Opens later", "gray"], closed: ["Closed", "red"], checked_in: ["Checked in", "green"],
} as const;

/**
 * Member QR Scanner: choose the event session, then scan the QR displayed by the organizers.
 * The server checks that the code belongs to the chosen session, that it is current and not revoked, that the session
 * is open, and that you are on the attendee list. No location is requested; the venue is shown for information only.
 */
export function MemberScanner({ sessions }: { sessions: SessionCard[] }) {
  const [selected, setSelected] = useState<string | null>(sessions.find((s) => s.state === "open")?.id ?? null);
  const [result, setResult] = useState<ScanActionResult | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = useCallback(async (code: string) => {
    if (busyRef.current || !selected) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await selfCheckInAction(code, selected);
      setResult(res);
      if (res.ok) setDone((d) => new Set(d).add(selected));
    } catch {
      setResult({ ok: false, reason: "invalid", message: "Couldn't reach the server. Check your connection and scan again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [selected]);

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        <p>You have no events with attendance opening today or soon.</p>
        <p className="mt-1"><Link href="/attendance" className="text-primary hover:underline">View my attendance history</Link></p>
      </div>
    );
  }

  const current = sessions.find((s) => s.id === selected);
  const canScan = !!current && current.state === "open" && !done.has(current.id);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">1. Choose the event session you are attending</legend>
        {sessions.map((s) => {
          const state = done.has(s.id) ? "checked_in" : s.state;
          const [text, tone] = STATE_TEXT[state];
          return (
            <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 shadow-sm ${selected === s.id ? "border-primary bg-surface" : "border-border bg-surface"}`}>
              <input type="radio" name="session" checked={selected === s.id} onChange={() => { setSelected(s.id); setResult(null); }} className="mt-1" />
              <span className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">{s.event.title} <span className="text-muted">· {s.label}</span></span>
                <span className="text-muted">{s.event.organization}</span>
                <span className="text-muted">{formatDateTime(new Date(s.event.startsAt))} – {formatDateTime(new Date(s.event.endsAt))}</span>
                <span>Venue: {s.event.venue}</span>
                <span><Badge tone={tone}>{text}</Badge>{s.myStatus && state !== "checked_in" ? <span className="ml-2 text-xs text-muted">Your status: {s.myStatus.toLowerCase()}</span> : null}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <section aria-labelledby="scan-heading" className="flex flex-col gap-3">
        <h2 id="scan-heading" className="text-sm font-medium">2. Scan the QR code shown by the organizers</h2>
        {!current && <p className="text-sm text-muted">Select a session first.</p>}
        {current && !canScan && <p className="text-sm text-muted">{done.has(current.id) || current.state === "checked_in" ? "You are already checked in for this session." : "This session is not open for check-in yet."}</p>}
        <QrCamera onCode={(c) => void submit(c)} disabled={!canScan} />
        {busy && <p className="text-sm text-muted" aria-live="polite">Checking…</p>}
        {result && <ResultBanner result={result} recordedLabel="Checked in" />}
      </section>

      <p className="text-sm"><Link href="/attendance" className="text-primary hover:underline">View my attendance history</Link></p>
    </div>
  );
}
