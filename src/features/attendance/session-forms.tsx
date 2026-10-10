"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { dangerButton, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { formatDateTime } from "@/lib/format";
import { useConfirm } from "@/components/shared/modal";
import {
  adjustAttendanceAction, getSessionQrAction, manualEntryAction, revokeSessionQrAction, selfCheckInAction, type ScanActionResult, type SessionActionState,
} from "./actions";

type Display = { src: string; at: Date; details: { event: string; organization: string; session: string; venue: string; startsAt: string; endsAt: string } };

/** Rotating check-in QR for one event session, with the event details beside it. Officers show it; students scan it. */
export function SessionQrDisplay({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<Display | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const confirm = useConfirm();
  const refresh = useCallback(async () => {
    try {
      const res = await getSessionQrAction(sessionId);
      if ("error" in res) { setState({ error: res.error }); return; }
      setState({ src: await QRCode.toDataURL(res.url, { margin: 2, width: 420, errorCorrectionLevel: "M" }), at: new Date(), details: res.details });
    } catch {
      setState({ error: "Couldn't load the code. Check your connection." });
    }
  }, [sessionId]);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 20_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh]);

  async function refreshNow() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  async function revoke() {
    if (!(await confirm({ title: "Revoke issued QR codes?", message: "Every check-in QR code issued so far for this session stops working. Members holding an older code will have to scan the new one.", confirmLabel: "Revoke codes", danger: true }))) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    try { await revokeSessionQrAction(fd); await refresh(); } finally { setBusy(false); }
  }

  if (!state) return <p className="text-sm text-muted">Loading the code…</p>;
  if ("error" in state) return <Notice kind="error">{state.error}</Notice>;
  const d = state.details;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="text-lg font-semibold">{d.event}</p>
        <p className="text-sm text-muted">{d.organization} · {d.session}</p>
        <p className="text-sm text-muted">{formatDateTime(new Date(d.startsAt))} – {formatDateTime(new Date(d.endsAt))}</p>
        <p className="text-sm">Venue: <strong>{d.venue}</strong></p>
      </div>
      {/* A data URL, so next/image optimization does not apply. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.src} alt={`Check-in QR code for ${d.event}, ${d.session}`} width={420} height={420} className="max-w-full rounded-xl border border-border bg-white" />
      <p className="max-w-md text-center text-sm text-muted" aria-live="polite">
        Updated {state.at.toLocaleTimeString()}. The code changes automatically every minute (this screen refreshes every 20 seconds), so screenshots stop working.
        Members scan it with <strong>Scan Attendance QR</strong>. Nothing about anyone&apos;s location is requested.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => void refreshNow()} disabled={refreshing || busy} className={secondaryButton}>{refreshing ? "Refreshing…" : "Refresh code"}</button>
        <button type="button" onClick={() => void revoke()} disabled={busy} className={dangerButton}>{busy ? "Revoking…" : "Revoke issued codes"}</button>
      </div>
    </div>
  );
}

export function ManualEntryForm({ sessionId, userId, name }: { sessionId: string; userId: string; name: string }) {
  const [s, action, pending] = useActionState<SessionActionState, FormData>(manualEntryAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="userId" value={userId} />
      <select name="status" aria-label={`Status for ${name}`} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"><option value="PRESENT">Present</option><option value="LATE">Late</option></select>
      <input name="remark" required minLength={3} maxLength={300} placeholder="Remark (required)" aria-label={`Remark for ${name}`} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="text-xs text-primary hover:underline">{pending ? "…" : "Record"}</button>
      {s.error && <span role="alert" className="text-xs text-danger">{s.error}</span>}
      {s.success && <span role="status" className="text-xs text-success">{s.success}</span>}
    </form>
  );
}

export function AdjustForm({ recordId, name, canManual, canExcuse, current }: { recordId: string; name: string; canManual: boolean; canExcuse: boolean; current: string }) {
  const [s, action, pending] = useActionState<SessionActionState, FormData>(adjustAttendanceAction, {});
  const options = [...(canManual ? ["PRESENT", "LATE", "ABSENT"] : []), ...(canExcuse ? ["EXCUSED"] : [])].filter((o) => o !== current);
  if (options.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="recordId" value={recordId} />
      <select name="status" aria-label={`Correct status for ${name}`} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs">{options.map((o) => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}</select>
      <input name="remark" required minLength={3} maxLength={300} placeholder="Reason (required)" aria-label={`Reason for ${name}`} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="text-xs text-primary hover:underline">{pending ? "…" : "Update"}</button>
      {s.error && <span role="alert" className="text-xs text-danger">{s.error}</span>}
    </form>
  );
}

/** Student check-in from the page a phone camera opens. No location or device information is requested. */
export function CheckInForm({ token, eventTitle, organization, sessionLabel, venue, when }: { token: string; eventTitle: string; organization: string; sessionLabel: string; venue: string; when: string }) {
  const [result, setResult] = useState<ScanActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function submit() {
    setBusy(true); setResult(null); setNote("");
    try {
      setResult(await selfCheckInAction(token));
    } catch {
      setNote("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div>
        <h1 className="text-xl font-semibold">{eventTitle}</h1>
        <p className="text-sm text-muted">{organization} · {sessionLabel}</p>
        <p className="text-sm text-muted">{when}</p>
        <p className="text-sm">Venue: <strong>{venue}</strong></p>
      </div>
      {result?.ok && <Notice kind="success">Checked in &middot; {result.status === "LATE" ? "recorded as Late" : "recorded as Present"}.</Notice>}
      {result && !result.ok && <Notice kind={result.reason === "duplicate" ? "info" : "error"}>{result.message}</Notice>}
      {note && <Notice kind="error">{note}</Notice>}
      {!result?.ok && <button type="button" onClick={() => void submit()} disabled={busy} className={primaryButton}>{busy ? "Checking in…" : "Check in"}</button>}
    </div>
  );
}
