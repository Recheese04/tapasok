"use client";

import { useActionState, useState } from "react";
import { generateJoinCodeAction, revokeJoinCodeAction, type JoinCodeState } from "./join-actions";

type Props = {
  organizationId: string;
  current: {
    hint: string;
    status: "active" | "expired" | "exhausted" | "revoked";
    expiresAt: string | null;
    maxUses: number | null;
    useCount: number;
  } | null;
};

const STATUS_LABEL = { active: "Active", expired: "Expired", exhausted: "Limit reached", revoked: "Revoked" } as const;
const input = "w-full rounded-lg border border-border px-3 py-2 text-sm";

export function JoinCodeManager({ organizationId, current }: Props) {
  const [genState, genAction, generating] = useActionState<JoinCodeState, FormData>(generateJoinCodeAction, {});
  const [revokeState, revokeAction, revoking] = useActionState<JoinCodeState, FormData>(revokeJoinCodeAction, {});
  const [copied, setCopied] = useState(false);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="join-code-heading" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h2 id="join-code-heading" className="font-medium">Join code</h2>
      <p className="text-sm text-muted">
        People who enter this code at Join organization become members. Codes never grant officer or admin roles.
        For security only a hash is stored, so a code is shown once when generated.
      </p>

      {current ? (
        <p className="text-sm">
          Current code ending <span className="font-mono">{current.hint}</span> &middot;{" "}
          <strong>{STATUS_LABEL[current.status]}</strong>
          {" · "}used {current.useCount}
          {current.maxUses !== null ? ` of ${current.maxUses}` : ""} times
          {current.expiresAt ? ` · expires ${new Date(current.expiresAt).toLocaleDateString()}` : " · no expiry"}
        </p>
      ) : (
        <p className="text-sm text-muted">No code has been generated yet.</p>
      )}

      {genState.code && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-success px-3 py-2">
          <span className="font-mono text-lg tracking-wider">{genState.code}</span>
          <button type="button" onClick={() => copy(genState.code!)} className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-sidebar">
            {copied ? "Copied" : "Copy"}
          </button>
          <span className="text-sm text-muted">{genState.success}</span>
        </div>
      )}
      {genState.error && <p role="alert" className="text-sm text-danger">{genState.error}</p>}
      {revokeState.error && <p role="alert" className="text-sm text-danger">{revokeState.error}</p>}
      {revokeState.success && <p role="status" className="text-sm text-success">{revokeState.success}</p>}

      <form action={genAction} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div>
          <label htmlFor="expiresOn" className="mb-1 block text-sm font-medium">Expires on (optional)</label>
          <input id="expiresOn" name="expiresOn" type="date" className={input} />
        </div>
        <div>
          <label htmlFor="maxUses" className="mb-1 block text-sm font-medium">Maximum uses (optional)</label>
          <input id="maxUses" name="maxUses" type="number" min={1} max={100000} inputMode="numeric" className={input} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={generating} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60">
            {generating ? "Generating…" : current?.status === "active" ? "Regenerate code" : "Generate code"}
          </button>
        </div>
      </form>

      {current?.status === "active" && (
        <form action={revokeAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <button type="submit" disabled={revoking} className="text-sm text-danger hover:underline disabled:opacity-60">
            Revoke current code
          </button>
        </form>
      )}
    </section>
  );
}
