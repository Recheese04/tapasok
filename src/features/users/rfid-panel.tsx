"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, useConfirm } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton, secondaryButton, dangerButton } from "@/components/shared/ui";
import type { EnrollmentState } from "@/features/attendance/rfid-enrollment";
import {
  cancelRfidEnrollmentAction, confirmRfidEnrollmentAction, removeRfidAction, rfidEnrollmentStatusAction, saveRfidManualAction,
  startRfidEnrollmentAction, type RfidManualState,
} from "./rfid-actions";

const box = "flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card";
type Device = { id: string; name: string; organization: string; lastSeenAt: string | null };
type Student = { name: string; studentNumber: string | null };
type Mode = "scan" | "manual";
type Flash = { kind: "success" | "error" | "info"; text: string } | null;

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium" });
};

/**
 * Register a student's RFID card, two ways: scan the physical card on a terminal (the terminal reports the exact UID it will
 * use at events; the admin confirms before anything is saved), or type the UID / use a USB reader. Removing is also here.
 */
export function RfidPanel({ userId, student, current, devices }: { userId: string; student: Student; current: string | null; devices: Device[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [mode, setMode] = useState<Mode>(devices.length ? "scan" : "manual");
  const [flash, setFlash] = useState<Flash>(null);
  const [removing, startRemove] = useTransition();
  const done = useCallback((text: string) => { setFlash({ kind: "success", text }); router.refresh(); }, [router]);

  const remove = () => startRemove(async () => {
    if (!(await confirm({ title: "Remove this card?", message: `Card ${current} will no longer check ${student.name} in. You can register a new card afterwards.`, confirmLabel: "Remove card", danger: true }))) return;
    const fd = new FormData(); fd.set("userId", userId);
    const res = await removeRfidAction(fd);
    if (res.error) setFlash({ kind: "error", text: res.error }); else done(res.success ?? "Card removed.");
  });

  return (
    <section id="rfid" className={`${box} scroll-mt-24`} aria-labelledby="rfid-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rfid-title" className="font-medium">RFID card</h2>
          <p className="text-sm text-muted">Used to check in by tapping the card on an attendance terminal.</p>
        </div>
        {current ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-success/10 px-3 py-1 font-mono text-sm text-success" aria-label={`Registered card ${current}`}>{current}</span>
            <button type="button" onClick={remove} disabled={removing} className="text-sm font-medium text-danger hover:underline">{removing ? "Removing…" : "Remove"}</button>
          </div>
        ) : <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-700">No card registered</span>}
      </div>

      {flash ? <Notice kind={flash.kind}>{flash.text}</Notice> : null}

      <div role="tablist" aria-label="How to register" className="inline-flex self-start rounded-full border border-border p-1">
        {([["scan", "Scan RFID card"], ["manual", "Enter UID manually"]] as const).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setFlash(null); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${mode === m ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {mode === "scan"
        ? <ScanToRegister userId={userId} student={student} devices={devices} current={current} onDone={done} />
        : <ManualEntry key={current ?? "none"} userId={userId} replacing={current} onDone={done} />}
    </section>
  );
}

// ---- Scan -------------------------------------------------------------------------------------------------------------

function ScanToRegister({ userId, student, devices, current, onDone }: { userId: string; student: Student; devices: Device[]; current: string | null; onDone: (text: string) => void }) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<{ id: string } | null>(null);
  const [pending, start] = useTransition();

  if (!devices.length) {
    return <Notice kind="info">No active terminals yet. A President or Secretary adds one under Attendance → Records → RFID terminals. Until then, use “Enter UID manually”.</Notice>;
  }
  const device = devices.find((d) => d.id === deviceId);

  return (
    <div className="flex flex-col gap-3">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Choose the terminal you are standing at.</li>
        <li>Click “Scan RFID card” and tap {student.name}&apos;s card on it within 60 seconds.</li>
        <li>Check the detected card number, then confirm. Nothing is saved before you confirm, and the tap is not counted as attendance.</li>
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <Field id="rfidDevice" label="Terminal">
          <select id="rfidDevice" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={`${inputClass} min-w-56`}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.organization}</option>)}
          </select>
        </Field>
        <button
          type="button" disabled={pending || !deviceId} className={primaryButton}
          onClick={() => start(async () => {
            setError(null);
            const r = await startRfidEnrollmentAction(userId, deviceId);
            if ("error" in r) setError(r.error); else setScan({ id: r.id });
          })}
        >{pending ? "Starting…" : "Scan RFID card"}</button>
      </div>
      {device ? (
        <p className={`text-sm ${device.lastSeenAt ? "text-muted" : "text-amber-700"}`}>
          {device.lastSeenAt ? `Last contact from this terminal: ${ago(device.lastSeenAt)}.` : "This terminal has never connected. Make sure it is powered on and online before scanning."}
        </p>
      ) : null}
      {scan ? (
        <ScanDialog
          key={scan.id} enrollmentId={scan.id} student={student} current={current} deviceName={device?.name ?? "the terminal"}
          onClose={() => setScan(null)}
          onSaved={(uid) => { setScan(null); onDone(`Card ${uid} registered to ${student.name}.`); }}
        />
      ) : null}
    </div>
  );
}

/** The scanning dialog: waits for the tap, shows the detected UID with the student, and saves only on Confirm. */
function ScanDialog({ enrollmentId, student, current, deviceName, onClose, onSaved }: {
  enrollmentId: string; student: Student; current: string | null; deviceName: string; onClose: () => void; onSaved: (uid: string) => void;
}) {
  const [state, setState] = useState<EnrollmentState | null>(null);
  const [left, setLeft] = useState(60);
  const [ack, setAck] = useState({ replace: false, reassign: false });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const settled = useRef(false); // saved or cancelled: nothing left to cancel on close

  // Ask the server every 1.5 s until the window is no longer waiting; count down once a second.
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const s = await rfidEnrollmentStatusAction(enrollmentId);
        if (!stop && s) setState(s);
        if (s && (s.state === "waiting" || s.state === "captured") && !stop) timer = setTimeout(poll, 1500);
      } catch {
        if (!stop) timer = setTimeout(poll, 3000); // a network blip: keep trying
      }
    };
    let timer = setTimeout(poll, 300);
    return () => { stop = true; clearTimeout(timer); };
  }, [enrollmentId]);

  const deadline = state && (state.state === "waiting" || state.state === "captured") ? state.expiresAt : null;
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [deadline]);

  const close = () => {
    if (!settled.current) { settled.current = true; void cancelRfidEnrollmentAction(enrollmentId); }
    onClose();
  };

  const save = () => startSave(async () => {
    setSaveError(null);
    const res = await confirmRfidEnrollmentAction(enrollmentId, ack);
    if (res.ok) { settled.current = true; onSaved(res.cardUid); return; }
    setSaveError(res.error);
  });

  const captured = state?.state === "captured" ? state : null;
  const needsReplace = !!captured && !!(captured.currentCard ?? current) && (captured.currentCard ?? current) !== captured.cardUid;
  const needsReassign = !!captured?.owner;
  const sameCard = !!captured && (captured.currentCard ?? current) === captured.cardUid;
  const canConfirm = !!captured && !sameCard && (!needsReplace || ack.replace) && (!needsReassign || ack.reassign);

  return (
    <Dialog open onClose={close} title="Scan RFID card" description={`Registering a card for ${student.name}${student.studentNumber ? ` (${student.studentNumber})` : ""}`} size="md" closeLabel={captured ? "Cancel" : "Cancel scan"}>
      <div className="flex flex-col gap-4" aria-live="polite">
        {!state || state.state === "waiting" ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center" role="status">
            <span className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 motion-reduce:animate-none" />
              <svg viewBox="0 0 24 24" className="relative h-10 w-10 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h4M7 14h7" /><path d="M16.5 9.5a3 3 0 0 1 0 5M18.5 8a5.5 5.5 0 0 1 0 8" /></svg>
            </span>
            <p className="text-lg font-semibold">Waiting for card scan…</p>
            <p className="text-sm text-muted">Tap {student.name}&apos;s card on <strong>{state?.state === "waiting" ? state.device : deviceName}</strong> and hold it still for a moment.</p>
            <p className="text-sm font-medium tabular-nums">{left}s left</p>
            {state?.state === "waiting" ? <p className="text-xs text-muted">Last contact from the terminal: {ago(state.lastSeenAt)}</p> : null}
          </div>
        ) : null}

        {captured ? (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-sidebar/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Detected card UID</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-wider" data-testid="detected-uid">{captured.cardUid}</p>
              <p className="mt-1 text-xs text-muted">Read by {captured.device}. Confirm within {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}.</p>
            </div>
            <div className="text-sm">
              <p className="text-muted">This card will belong to</p>
              <p className="text-base font-semibold">{captured.student.name}{captured.student.studentNumber ? <span className="font-normal text-muted"> · {captured.student.studentNumber}</span> : null}</p>
            </div>
            {sameCard ? <Notice kind="info">This card is already registered to {captured.student.name}. Nothing to change.</Notice> : null}
            {needsReassign ? (
              <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
                <p><strong>This card is registered to {captured.owner!.name}{captured.owner!.studentNumber ? ` (${captured.owner!.studentNumber})` : ""}.</strong> Confirming removes it from them.</p>
                <label className="flex items-start gap-2"><input type="checkbox" checked={ack.reassign} onChange={(e) => setAck((a) => ({ ...a, reassign: e.target.checked }))} className="mt-0.5" />
                  <span>Move card {captured.cardUid} from {captured.owner!.name} to {captured.student.name}</span></label>
              </div>
            ) : null}
            {needsReplace && !sameCard ? (
              <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
                <p>{captured.student.name} already has card <span className="font-mono">{captured.currentCard ?? current}</span>. It will stop working.</p>
                <label className="flex items-start gap-2"><input type="checkbox" checked={ack.replace} onChange={(e) => setAck((a) => ({ ...a, replace: e.target.checked }))} className="mt-0.5" />
                  <span>Replace the current card</span></label>
              </div>
            ) : null}
            {saveError ? <Notice kind="error">{saveError}</Notice> : null}
            <button type="submit" disabled={!canConfirm || saving} className={needsReplace || needsReassign ? dangerButton : primaryButton}>
              {saving ? "Saving…" : needsReassign ? "Confirm and move card" : needsReplace ? "Confirm and replace" : "Confirm registration"}
            </button>
          </form>
        ) : null}

        {state?.state === "expired" ? (
          <Notice kind="error">
            {state.captured
              ? "The confirmation time ran out, so the card was not saved. Start the scan again."
              : `No card reached Tapasok from “${state.device}” within 60 seconds. Check that the terminal is powered on and connected to Wi-Fi (last contact: ${ago(state.lastSeenAt)}), then start again.`}
          </Notice>
        ) : null}
        {state?.state === "failed" ? <Notice kind="error">{state.message}</Notice> : null}
        {state?.state === "cancelled" ? <Notice kind="info">This scan was cancelled, possibly because a new scan was started for this student or terminal.</Notice> : null}
      </div>
    </Dialog>
  );
}

// ---- Manual -----------------------------------------------------------------------------------------------------------

function ManualEntry({ userId, replacing, onDone }: { userId: string; replacing: string | null; onDone: (text: string) => void }) {
  const [s, action, pending] = useActionState<RfidManualState, FormData>(saveRfidManualAction, {});
  const [uid, setUid] = useState("");
  // On success the card changes, the page refreshes and the parent re-mounts this form (keyed by the card), clearing it.
  useEffect(() => { if (s.success) onDone(s.success); }, [s, onDone]);
  // A confirmation request is for the number that was submitted; editing the number asks again.
  const asking = s.needs && s.uid && s.uid === uid.trim().toUpperCase().replace(/[\s:-]/g, "") ? s.needs : null;
  return (
    <form action={action} className="flex flex-col gap-3">
      {s.error && !asking ? <Notice kind="error">{s.error}</Notice> : null}
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field id="rfidManual" label="Card UID" hint="Hexadecimal, for example 04A1B2C3. A USB card reader can type it for you: click the box, then tap the card.">
          <input id="rfidManual" name="rfidUid" required value={uid} onChange={(e) => setUid(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="04A1B2C3" className={`${inputClass} min-w-56 font-mono uppercase`} />
        </Field>
      </div>
      {asking === "reassign" ? (
        <label className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          <input type="checkbox" name="confirmReassign" required className="mt-0.5" />
          <span>{s.error} Tick to move it.</span>
        </label>
      ) : null}
      {asking === "replace" || (asking === "reassign" && replacing) ? (
        <label className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
          <input type="checkbox" name="confirmReplace" required className="mt-0.5" />
          <span>Replace the current card {replacing} (it will stop working).</span>
        </label>
      ) : null}
      <button type="submit" disabled={pending} className={`${asking ? dangerButton : replacing ? secondaryButton : primaryButton} self-start`}>
        {pending ? "Saving…" : asking ? "Confirm and save" : replacing ? "Replace card" : "Save card"}
      </button>
    </form>
  );
}
