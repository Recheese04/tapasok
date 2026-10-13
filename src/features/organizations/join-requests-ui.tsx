"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notice, primaryButton } from "@/components/shared/ui";
import { joinOrganizationAction, type JoinState } from "./request-actions";

/** Join an interest-based organization immediately (no approval). The page refreshes so the new membership shows at once. */
export function JoinButton({ organizationId, name }: { organizationId: string; name: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<JoinState, FormData>(joinOrganizationAction, {});
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  if (state.success) return <Notice kind="success">{state.success}</Notice>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <button type="submit" disabled={pending} aria-label={`Join ${name}`} className={primaryButton}>{pending ? "Joining…" : "Join"}</button>
      {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
    </form>
  );
}
