"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/shared/modal";
import { Notice, primaryButton, secondaryButton } from "@/components/shared/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * The signed-in person's own profile picture: preview before saving, upload progress, change and remove. The server
 * validates and re-encodes every upload; the checks here only save a wasted upload.
 */
export function ProfilePhotoCard({ userId, name, version, allowed }: { userId: string; name: string; version: number | null; allowed: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [current, setCurrent] = useState(version);
  const busy = progress !== null;
  const initials = name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (f: File | undefined) => {
    setMsg(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) { setMsg({ kind: "error", text: "Use a JPEG, PNG or WebP picture." }); return; }
    if (f.size > MAX_BYTES) { setMsg({ kind: "error", text: "The picture is too large. Use one under 5 MB." }); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const cancel = () => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; };

  const save = () => {
    if (!file) return;
    const body = new FormData();
    body.set("photo", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/profile/photo");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setProgress(null);
      let res: { ok?: boolean; version?: number; error?: string } = {};
      try { res = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 200 && res.ok) {
        setCurrent(res.version ?? (current ?? 0) + 1);
        cancel();
        setMsg({ kind: "success", text: "Profile picture saved." });
        router.refresh();
      } else setMsg({ kind: "error", text: res.error ?? "The picture could not be saved. Try again." });
    };
    xhr.onerror = () => { setProgress(null); setMsg({ kind: "error", text: "Could not reach the server. Check your connection and try again." }); };
    setMsg(null);
    setProgress(0);
    xhr.send(body);
  };

  const remove = async () => {
    if (!(await confirm({ title: "Remove your profile picture?", message: "Your initials will be shown instead. You can add a new picture at any time.", confirmLabel: "Remove picture", danger: true }))) return;
    setProgress(100);
    try {
      const r = await fetch("/api/profile/photo", { method: "DELETE" });
      const res = await r.json().catch(() => ({}));
      if (r.ok) { setCurrent(null); setMsg({ kind: "success", text: "Profile picture removed." }); router.refresh(); }
      else setMsg({ kind: "error", text: res.error ?? "The picture could not be removed." });
    } catch {
      setMsg({ kind: "error", text: "Could not reach the server. Check your connection and try again." });
    } finally { setProgress(null); }
  };

  const shown = preview ?? (current !== null ? `/users/${userId}/photo?v=${current}` : null);
  return (
    <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, authorized picture (or a local preview)
        <img src={shown} alt={preview ? "Preview of your new profile picture" : "Your profile picture"} className="h-28 w-28 shrink-0 rounded-3xl object-cover ring-1 ring-border" />
      ) : (
        <span aria-hidden="true" className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl bg-primary-soft text-3xl font-semibold text-primary">{initials || "?"}</span>
      )}
      <div className="flex min-w-0 flex-col gap-3">
        {!allowed ? (
          <p className="text-sm text-muted">System administrator accounts do not have a profile picture.</p>
        ) : (
          <>
            <p className="text-sm text-muted">{preview ? "This is how your new picture will look. Save it to use it everywhere, including on the officers' attendance screen when you tap your card." : "Shown to officers in your organizations, for example when you tap your RFID card. JPEG, PNG or WebP, up to 5 MB."}</p>
            <input ref={input} type="file" accept={TYPES.join(",")} className="sr-only" id="profile-photo-input" onChange={(e) => choose(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              {preview ? (
                <>
                  <button type="button" onClick={save} disabled={busy} className={primaryButton}>{busy ? "Uploading…" : "Save picture"}</button>
                  <button type="button" onClick={cancel} disabled={busy} className={secondaryButton}>Cancel</button>
                </>
              ) : (
                <>
                  <label htmlFor="profile-photo-input" className={`${primaryButton} cursor-pointer`} aria-disabled={busy}>{current !== null ? "Change picture" : "Upload picture"}</label>
                  {current !== null ? <button type="button" onClick={() => void remove()} disabled={busy} className="text-sm font-medium text-danger hover:underline">Remove</button> : null}
                </>
              )}
            </div>
            {progress !== null && preview ? (
              <div className="flex items-center gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Upload progress">
                <span className="h-2 w-48 overflow-hidden rounded-full bg-primary-soft"><span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></span>
                <span className="text-xs tabular-nums text-muted">{progress < 100 ? `${progress}%` : "Processing…"}</span>
              </div>
            ) : null}
          </>
        )}
        {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      </div>
    </div>
  );
}
