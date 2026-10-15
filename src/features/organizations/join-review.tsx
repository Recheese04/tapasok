"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDanger, Badge, Notice, primaryButton } from "@/components/shared/ui";
import { useConfirm } from "@/components/shared/modal";
import { decideJoinRequestAction } from "./request-actions";

type Pending = {
  id: string; name: string; email: string; studentNumber: string | null; yearLevel: number | null; program: string | null;
  college: string | null; department: string | null; message: string | null; createdAt: string; rejectedBefore: number;
};
type Decided = { id: string; name: string; status: "APPROVED" | "REJECTED"; decidedAt: string | null; decidedBy: string | null; note: string | null };

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/** Join requests for one organization: the student's details, approve / reject with an optional note, and recent decisions. */
export function JoinRequestReview({ pending, decided }: { pending: Pending[]; decided: Decided[] }) {
  return (
    <div className="flex flex-col gap-4">
      {pending.length === 0 ? <p className="text-sm text-muted">No pending requests.</p> : (
        <ul className="flex flex-col divide-y divide-border">
          {pending.map((r) => <RequestRow key={r.id} r={r} />)}
        </ul>
      )}
      {decided.length > 0 && (
        <details className="rounded-xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Recent decisions ({decided.length})</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {decided.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={d.status === "APPROVED" ? "green" : "red"}>{d.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                <span className="font-medium">{d.name}</span>
                <span className="text-muted">{d.decidedAt ? when(d.decidedAt) : ""}{d.decidedBy ? ` · by ${d.decidedBy}` : ""}{d.note ? ` · “${d.note}”` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RequestRow({ r }: { r: Pending }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const decide = (decision: "approve" | "reject") => start(async () => {
    if (decision === "reject" && !(await confirm({ title: "Reject this request?", message: `${r.name} will be told the request was declined${note ? " with your note" : ""}. They can ask again later.`, confirmLabel: "Reject", danger: true }))) return;
    const fd = new FormData();
    fd.set("requestId", r.id); fd.set("decision", decision); fd.set("note", note);
    try {
      const res = await decideJoinRequestAction(fd);
      if (res.error) setMsg({ kind: "error", text: res.error });
      else { setMsg({ kind: "success", text: res.success ?? "Saved." }); router.refresh(); }
    } catch {
      setMsg({ kind: "error", text: "You are not allowed to decide this request." });
    }
  });

  const details = [r.studentNumber, r.program, r.yearLevel ? `Year ${r.yearLevel}` : null, r.department ?? r.college].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{r.name}</p>
          <p className="text-sm text-muted">{details || "No student profile on file"}</p>
          <p className="text-xs text-muted">{r.email} · requested {when(r.createdAt)}{r.rejectedBefore ? ` · rejected ${r.rejectedBefore} time${r.rejectedBefore === 1 ? "" : "s"} before` : ""}</p>
          {r.message ? <p className="mt-1 rounded-lg bg-primary-soft/40 px-3 py-2 text-sm">“{r.message}”</p> : null}
        </div>
        {msg?.kind === "success" ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} aria-label={`Decision note for ${r.name} (optional)`} placeholder="Note to the student (optional)" maxLength={300} className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm" />
            <button type="button" disabled={pending} onClick={() => decide("approve")} className={primaryButton}>{pending ? "Saving…" : "Approve"}</button>
            <button type="button" disabled={pending} onClick={() => decide("reject")} className={actionDanger}>Reject</button>
          </div>
        )}
      </div>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
    </li>
  );
}
