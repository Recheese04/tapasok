"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirmSubmit } from "@/components/shared/modal";
import { RefreshOnSubmit } from "@/components/shared/confirm-button";
import { Field, inputClass, Notice, primaryButton, secondaryButton, dangerButton } from "@/components/shared/ui";
import { cancelRfidEnrollmentAction, removeRfidAction, rfidEnrollmentStatusAction, saveRfidManualAction, startRfidEnrollmentAction, type RfidManualState } from "./rfid-actions";

const box = "flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card";
type Device = { id: string; name: string; organization: string; lastSeenAt: string | null };
type Mode = "tap" | "manual";

/**
 * Register a student's RFID card, two ways: tap the card on a terminal (the terminal reports the exact UID it will use at
 * events), or type the UID / use a USB reader. Removing a card is also here.
 */
export function RfidPanel({ userId, current, devices }: { userId: string; current: string | null; devices: Device[] }) {
  const [mode, setMode] = useState<Mode>(devices.length ? "tap" : "manual");
  const confirmSubmit = useConfirmSubmit();
  return (
    <section className={box} aria-labelledby="rfid-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rfid-title" className="font-medium">RFID card</h2>
          <p className="text-sm text-muted">Used to check in by tapping the card on an attendance terminal.</p>
        </div>
        {current ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-success/10 px-3 py-1 font-mono text-sm text-success">{current}</span>
            <form action={removeRfidAction} onSubmit={confirmSubmit({ title: "Remove this card?", message: `Card ${current} will no longer check this student in. You can register a new card afterwards.`, confirmLabel: "Remove card", danger: true })}>
              <input type="hidden" name="userId" value={userId} />
              <RefreshOnSubmit />
              <button type="submit" className="text-sm font-medium text-danger hover:underline">Remove</button>
            </form>
          </div>
        ) : <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-700">No card registered</span>}
      </div>

      <div role="tablist" aria-label="How to register" className="inline-flex self-start rounded-full border border-border p-1">
        {([["tap", "Tap card on a terminal"], ["manual", "Enter manually"]] as const).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${mode === m ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {mode === "tap" ? <TapToRegister userId={userId} devices={devices} replacing={!!current} /> : <ManualEntry userId={userId} replacing={!!current} />}
    </section>
  );
}

function TapToRegister({ userId, devices, replacing }: { userId: string; devices: Device[]; replacing: boolean }) {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [session, setSession] = useState<{ id: string; expiresAt: number } | null>(null);
  const [result, setResult] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [pending, start] = useTransition();
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // While waiting: count down every second and ask the server every 1.5 s whether the card was tapped.
  useEffect(() => {
    if (!session) return;
    const tick = setInterval(() => setLeft(Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))), 250);
    const poll = setInterval(async () => {
      const s = await rfidEnrollmentStatusAction(session.id, userId);
      if (!s || s.state === "waiting") return;
      setSession(null);
      if (s.state === "done") { setResult({ kind: "success", text: `Card ${s.cardUid} registered.` }); router.refresh(); }
      else if (s.state === "failed") setResult({ kind: "error", text: s.message });
      else if (s.state === "expired") setResult({ kind: "info", text: "No card was tapped in time. Start again when you are at the terminal." });
    }, 1500);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [session, userId, router]);

  // Leaving the page closes the window, so a later tap is not registered by mistake.
  useEffect(() => () => { if (sessionRef.current) void cancelRfidEnrollmentAction(sessionRef.current.id); }, []);

  if (!devices.length) {
    return <Notice kind="info">No active terminals yet. Add one under Attendance → Devices, or use “Enter manually”.</Notice>;
  }
  const device = devices.find((d) => d.id === deviceId);

  if (session) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center" role="status" aria-live="polite">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 motion-reduce:animate-none" />
          <svg viewBox="0 0 24 24" className="relative h-10 w-10 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h4M7 14h7" /><path d="M16.5 9.5a3 3 0 0 1 0 5M18.5 8a5.5 5.5 0 0 1 0 8" /></svg>
        </span>
        <p className="text-lg font-semibold">Tap the card on “{device?.name}” now</p>
        <p className="text-sm text-muted">Waiting for the card… {left}s left. The tap registers the card and is not counted as attendance.</p>
        <button type="button" className={secondaryButton} onClick={() => { const id = session.id; setSession(null); setResult(null); void cancelRfidEnrollmentAction(id); }}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {result ? <Notice kind={result.kind}>{result.text}</Notice> : null}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Choose the terminal you are standing at.</li>
        <li>Click “Start” and tap the student&apos;s card on it within 60 seconds.</li>
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <Field id="rfidDevice" label="Terminal">
          <select id="rfidDevice" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={`${inputClass} min-w-56`}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.organization}{d.lastSeenAt ? "" : " · never connected"}</option>)}
          </select>
        </Field>
        <button
          type="button" disabled={pending || !deviceId} className={primaryButton}
          onClick={() => start(async () => {
            setResult(null);
            const r = await startRfidEnrollmentAction(userId, deviceId);
            if ("error" in r) setResult({ kind: "error", text: r.error });
            else { setSession({ id: r.id, expiresAt: new Date(r.expiresAt).getTime() }); setLeft(60); }
          })}
        >{pending ? "Starting…" : replacing ? "Start (replace card)" : "Start"}</button>
      </div>
      {device && !device.lastSeenAt ? <p className="text-sm text-amber-700">This terminal has never connected. Make sure it is powered on and online.</p> : null}
    </div>
  );
}

function ManualEntry({ userId, replacing }: { userId: string; replacing: boolean }) {
  const router = useRouter();
  const [s, action, pending] = useActionState<RfidManualState, FormData>(saveRfidManualAction, {});
  useEffect(() => { if (s.success) router.refresh(); }, [s, router]);
  return (
    <form action={action} className="flex flex-col gap-3">
      {s.error ? <Notice kind="error">{s.error}</Notice> : null}
      {s.success ? <Notice kind="success">{s.success}</Notice> : null}
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field id="rfidManual" label="Card UID" hint="Hexadecimal, for example 04A1B2C3. A USB card reader can type it for you: click the box, then tap the card.">
          <input id="rfidManual" name="rfidUid" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="04A1B2C3" className={`${inputClass} min-w-56 font-mono uppercase`} />
        </Field>
        <button type="submit" disabled={pending} className={replacing ? dangerButton : primaryButton}>{pending ? "Saving…" : replacing ? "Replace card" : "Save card"}</button>
      </div>
    </form>
  );
}
