"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { primaryButton, secondaryButton } from "@/components/shared/ui";
import { toggleSessionAction } from "./actions";

/** Opens or closes a session for check-in, then refreshes the page behind it. Shows the reason when it is refused. */
export function SessionToggle({ sessionId, next }: { sessionId: string; next: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={pending}
        className={next ? primaryButton : secondaryButton}
        onClick={() => start(async () => {
          setError(null);
          const res = await toggleSessionAction(sessionId, next);
          if (!res.ok) setError(res.error);
          else router.refresh();
        })}
      >
        {pending ? "Working…" : next ? "Open session for check-in" : "Close session for check-in"}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
