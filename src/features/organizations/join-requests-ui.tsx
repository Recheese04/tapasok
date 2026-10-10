"use client";

import { useActionState } from "react";
import { inputClass, Notice, secondaryButton } from "@/components/shared/ui";
import { submitJoinRequestAction, type RequestState } from "./request-actions";

export function RequestToJoinForm({ organizationId, name }: { organizationId: string; name: string }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(submitJoinRequestAction, {});
  if (state.success) return <Notice kind="success">{state.success}</Notice>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input name="message" aria-label={`Message to ${name} (optional)`} placeholder="Message (optional)" maxLength={300} className={`${inputClass} max-w-xs`} />
      <button type="submit" disabled={pending} className={secondaryButton}>{pending ? "Sending…" : "Request to join"}</button>
      {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
    </form>
  );
}
