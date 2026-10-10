"use client";

import { useActionState } from "react";
import { joinOrganizationAction, type JoinState } from "./join-actions";

export function JoinForm() {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(joinOrganizationAction, {});

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <div>
        <label htmlFor="code" className="mb-1 block text-sm font-medium">Join code</label>
        <input
          id="code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          className="w-full rounded-lg border border-border px-3 py-2 font-mono text-sm uppercase"
        />
      </div>
      <button type="submit" disabled={pending} className="self-start rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60">
        {pending ? "Joining…" : "Join organization"}
      </button>
    </form>
  );
}
