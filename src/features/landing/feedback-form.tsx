"use client";

import { useActionState, useState } from "react";
import { RefreshOnSubmit } from "@/components/shared/confirm-button";
import { useConfirm } from "@/components/shared/modal";
import { inputClass, Notice, primaryButton, rowDanger } from "@/components/shared/ui";
import { removeOwnFeedbackAction, submitFeedbackAction, type LandingState } from "./actions";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** The signed-in person's own rating and comment. Star buttons are real radio inputs, so keyboards and screen readers work. */
export function FeedbackForm({ initial, max }: { initial: { rating: number; comment: string } | null; max: number }) {
  const [state, action, pending] = useActionState<LandingState, FormData>(submitFeedbackAction, {});
  const [removeState, removeAction, removing] = useActionState<LandingState>(removeOwnFeedbackAction, {});
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const confirm = useConfirm();
  const shown = hover || rating;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <RefreshOnSubmit />
        <fieldset>
          <legend className="text-sm font-medium">Your rating</legend>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
                  <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" required />
                  <span className="sr-only">{n} star{n === 1 ? "" : "s"} ({WORDS[n]})</span>
                  <svg viewBox="0 0 20 20" className={`h-9 w-9 rounded-md transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${n <= shown ? "text-[#f5a524]" : "text-[#e4e0ee]"} hover:scale-110`} aria-hidden="true">
                    <path fill="currentColor" d="M10 1.6l2.47 5.3 5.8.68-4.28 3.98 1.13 5.74L10 14.43 4.88 17.3l1.13-5.74L1.73 7.58l5.8-.68z" />
                  </svg>
                </label>
              ))}
            </div>
            <span className="text-sm text-muted" aria-live="polite">{shown ? WORDS[shown] : "Choose 1 to 5 stars"}</span>
          </div>
        </fieldset>
        <div>
          <label htmlFor="comment" className="text-sm font-medium">Comment <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="comment" name="comment" rows={4} maxLength={max} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="What do you like about Tapasok? What could be better?" className={`${inputClass} mt-1`} aria-describedby="comment-help" />
          <p id="comment-help" className="mt-1 flex justify-between text-xs text-muted">
            <span>Shown with your first name and last initial only. Plain text only (no formatting).</span>
            <span className="tabular-nums">{comment.length}/{max}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={pending || rating === 0}>{pending ? "Sending…" : initial ? "Update feedback" : "Send feedback"}</button>
          {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
        </div>
        {state.success && <Notice kind="success">{state.success}</Notice>}
      </form>
      {initial && (
        <form action={removeAction}>
          <RefreshOnSubmit />
          <button type="button" className={rowDanger} disabled={removing} onClick={async (e) => {
            const form = e.currentTarget.form;
            if (await confirm({ title: "Remove your feedback?", message: "Your rating and comment will no longer be shown or counted. You can post new feedback later.", confirmLabel: "Remove", danger: true })) form?.requestSubmit();
          }}>Remove my feedback</button>
          {removeState.error && <p role="alert" className="text-sm text-danger">{removeState.error}</p>}
          {removeState.success && <Notice kind="success">{removeState.success}</Notice>}
        </form>
      )}
    </div>
  );
}
