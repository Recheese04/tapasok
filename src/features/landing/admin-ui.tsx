"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshOnSubmit } from "@/components/shared/confirm-button";
import { useConfirm } from "@/components/shared/modal";
import { actionButton, actionDanger, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { imageAction, moderateFeedbackAction, showOnLandingAction, type LandingState } from "./actions";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

type Pick = { key: string; file: File; url: string; alt: string; progress: number | null; error?: string };

/**
 * Upload landing-page pictures for one event: choose one or more files, preview them, add a short description for each,
 * then upload with progress. The server validates and re-encodes every picture; these checks only save wasted uploads.
 */
export function ImageUploader({ eventId, remaining }: { eventId: string; remaining: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const busy = picks.some((p) => p.progress !== null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const choose = (files: FileList | null) => {
    setMsg(null);
    if (!files) return;
    const next: Pick[] = [];
    const problems: string[] = [];
    for (const f of Array.from(files)) {
      if (!TYPES.includes(f.type)) { problems.push(`${f.name}: use a JPEG, PNG or WebP picture.`); continue; }
      if (f.size > MAX_BYTES) { problems.push(`${f.name}: larger than 4 MB.`); continue; }
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, file: f, url, alt: "", progress: null });
    }
    const room = Math.max(0, remaining - picks.length);
    if (next.length > room) problems.push(`Only ${room} more picture${room === 1 ? "" : "s"} can be added to this event.`);
    setPicks((p) => [...p, ...next.slice(0, room)]);
    if (problems.length) setMsg({ kind: "error", text: problems.join(" ") });
    if (input.current) input.current.value = "";
  };

  const update = (key: string, patch: Partial<Pick>) => setPicks((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const uploadOne = (p: Pick) => new Promise<boolean>((resolve) => {
    const body = new FormData();
    body.set("eventId", eventId);
    body.set("image", p.file);
    body.set("altText", p.alt);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/event-images");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) update(p.key, { progress: Math.round((e.loaded / e.total) * 100) }); };
    xhr.onload = () => {
      let res: { ok?: boolean; error?: string } = {};
      try { res = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 200 && res.ok) resolve(true);
      else { update(p.key, { progress: null, error: res.error ?? "The picture could not be saved." }); resolve(false); }
    };
    xhr.onerror = () => { update(p.key, { progress: null, error: "Could not reach the server. Check your connection." }); resolve(false); };
    update(p.key, { progress: 0, error: undefined });
    xhr.send(body);
  });

  const uploadAll = async () => {
    setMsg(null);
    let saved = 0;
    for (const p of picks) {
      if (await uploadOne(p)) { saved++; setPicks((ps) => ps.filter((x) => x.key !== p.key)); }
    }
    if (saved) { setMsg({ kind: "success", text: `${saved} picture${saved === 1 ? "" : "s"} uploaded.` }); router.refresh(); }
  };

  if (remaining <= 0 && picks.length === 0) return <Notice kind="info">This event has the maximum of 6 pictures. Remove one to add another.</Notice>;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-sidebar/40 px-4 py-8 text-center hover:border-primary/50">
        <span className="text-sm font-medium text-primary">Choose pictures</span>
        <span className="text-xs text-muted">JPEG, PNG or WebP, up to 4 MB each. {remaining} more allowed. Location and camera data are removed.</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => choose(e.target.files)} />
      </label>
      {picks.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {picks.map((p) => (
            <li key={p.key} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a file the admin chose */}
              <img src={p.url} alt="" className="aspect-video w-full rounded-xl object-cover" />
              <input aria-label={`Description of ${p.file.name}`} placeholder="Short description (for screen readers)" maxLength={200} value={p.alt} disabled={p.progress !== null}
                onChange={(e) => update(p.key, { alt: e.target.value })} className={inputClass} />
              {p.progress !== null && (
                <div className="h-2 overflow-hidden rounded-full bg-sidebar" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${p.file.name}`}>
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${p.progress}%` }} />
                </div>
              )}
              {p.error && <p role="alert" className="text-xs text-danger">{p.error}</p>}
              <button type="button" className={actionDanger} disabled={p.progress !== null} onClick={() => setPicks((ps) => ps.filter((x) => x.key !== p.key))}>Remove from upload</button>
            </li>
          ))}
        </ul>
      )}
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} disabled={busy} onClick={uploadAll}>{busy ? "Uploading…" : `Upload ${picks.length} picture${picks.length === 1 ? "" : "s"}`}</button>
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => setPicks([])}>Clear</button>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

function useLandingAction(action: (s: LandingState, fd: FormData) => Promise<LandingState>) {
  return useActionState<LandingState, FormData>(action, {});
}

/** One stored picture: preview, description, order and removal. */
export function ImageCard({ id, alt, first, last, index }: { id: string; alt: string; first: boolean; last: boolean; index: number }) {
  const [state, action, pending] = useLandingAction(imageAction);
  const confirm = useConfirm();
  const removeForm = useRef<HTMLFormElement>(null);
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-card">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- authorized picture served by our own route */}
        <img src={`/event-images/${id}`} alt={alt || `Picture ${index + 1}`} className="aspect-video w-full rounded-xl object-cover" loading="lazy" />
        {first && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">Cover</span>}
      </div>
      <form action={action} className="flex gap-2">
        <RefreshOnSubmit />
        <input type="hidden" name="imageId" value={id} /><input type="hidden" name="op" value="alt" />
        <input name="altText" defaultValue={alt} maxLength={200} aria-label="Picture description" placeholder="Short description" className={inputClass} />
        <button type="submit" className={actionButton} disabled={pending}>Save</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {(["up", "down"] as const).map((op) => (
          <form key={op} action={action}><RefreshOnSubmit />
            <input type="hidden" name="imageId" value={id} /><input type="hidden" name="op" value={op} />
            <button type="submit" className={actionButton} disabled={pending || (op === "up" ? first : last)} aria-label={op === "up" ? "Move earlier" : "Move later"}>{op === "up" ? "← Earlier" : "Later →"}</button>
          </form>
        ))}
        <form ref={removeForm} action={action} className="ml-auto"><RefreshOnSubmit />
          <input type="hidden" name="imageId" value={id} /><input type="hidden" name="op" value="remove" />
          <button type="button" className={actionDanger} disabled={pending} onClick={async () => {
            if (await confirm({ title: "Remove this picture?", message: "It disappears from the landing page. You can restore it later from Removed pictures.", confirmLabel: "Remove", danger: true })) removeForm.current?.requestSubmit();
          }}>Remove</button>
        </form>
      </div>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-success">{state.success}</p>}
    </li>
  );
}

export function RestoreImageButton({ id }: { id: string }) {
  const [state, action, pending] = useLandingAction(imageAction);
  return (
    <form action={action} className="flex flex-col items-start gap-1"><RefreshOnSubmit />
      <input type="hidden" name="imageId" value={id} /><input type="hidden" name="op" value="restore" />
      <button type="submit" className={actionButton} disabled={pending}>{pending ? "Restoring…" : "Restore"}</button>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function ShowOnLandingToggle({ eventId, shown, canShow }: { eventId: string; shown: boolean; canShow: boolean }) {
  const [state, action, pending] = useLandingAction(showOnLandingAction);
  return (
    <form action={action} className="flex flex-col items-start gap-1"><RefreshOnSubmit />
      <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="show" value={shown ? "false" : "true"} />
      <button type="submit" className={shown ? secondaryButton : primaryButton} disabled={pending || (!shown && !canShow)}>
        {pending ? "Saving…" : shown ? "Hide from landing page" : "Show on landing page"}
      </button>
      {!shown && !canShow && <p className="text-xs text-muted">Add at least one picture first.</p>}
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-success">{state.success}</p>}
    </form>
  );
}

const MODERATION: Record<"approve" | "hide" | "delete" | "restore", { label: string; danger?: boolean; confirm?: string }> = {
  approve: { label: "Approve" },
  hide: { label: "Hide" },
  delete: { label: "Delete", danger: true, confirm: "The entry is removed from every list. You can restore it from the Deleted tab." },
  restore: { label: "Restore" },
};

const FlashContext = createContext<(s: LandingState) => void>(() => {});

/**
 * Holds the result message of the last moderation step. It sits above the list, so the message stays visible after the
 * entry moves to another tab (the page refreshes as soon as the landing page's data changes).
 */
export function ModerationFlash({ children }: { children: React.ReactNode }) {
  const [flash, setFlash] = useState<LandingState>({});
  return (
    <FlashContext.Provider value={setFlash}>
      {(flash.success || flash.error) && <Notice kind={flash.error ? "error" : "success"}>{flash.error ?? flash.success}</Notice>}
      {children}
    </FlashContext.Provider>
  );
}

/** Approve / hide / delete / restore buttons for one feedback entry. The result is shown by ModerationFlash. */
export function ModerationButtons({ id, actions }: { id: string; actions: ("approve" | "hide" | "delete" | "restore")[] }) {
  const flash = useContext(FlashContext);
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = async (fd: FormData) => {
    setPending(true);
    flash({});
    const res = await moderateFeedbackAction({}, fd);
    flash(res);
    setPending(false);
    router.refresh();
  };
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {actions.map((a) => {
        const m = MODERATION[a];
        return (
          <form key={a} action={run}>
            <input type="hidden" name="feedbackId" value={id} /><input type="hidden" name="action" value={a} />
            {m.confirm ? (
              <button type="button" disabled={pending} className={actionDanger} onClick={async (e) => {
                const form = e.currentTarget.form;
                if (await confirm({ title: "Delete this feedback?", message: m.confirm!, confirmLabel: m.label, danger: true })) form?.requestSubmit();
              }}>{m.label}</button>
            ) : <button type="submit" disabled={pending} className={m.danger ? actionDanger : actionButton}>{m.label}</button>}
          </form>
        );
      })}
    </div>
  );
}
