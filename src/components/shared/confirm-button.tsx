"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useConfirm } from "./modal";

/**
 * A server action that returns nothing does not make Next.js re-render the page by itself, so the list would keep showing the
 * old state. Place this inside such a form: when the submission finishes, the current page is refreshed with fresh data.
 */
export function RefreshOnSubmit() {
  const { pending } = useFormStatus();
  const router = useRouter();
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) router.refresh();
    was.current = pending;
  }, [pending, router]);
  return null;
}

/**
 * Submit button that asks for confirmation in a dialog first. Use for destructive or hard-to-undo actions: nothing is
 * submitted unless the person confirms. Red-styled buttons get a red Confirm button. When the action finishes, the page
 * behind is refreshed so the change is visible straight away.
 */
export function ConfirmButton({ message, children, className, title, confirmLabel }: { message: string; children: React.ReactNode; className?: string; title?: string; confirmLabel?: string }) {
  const confirm = useConfirm();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <RefreshOnSubmit />
      <button
        ref={ref}
        type="submit"
        className={className}
        onClick={async (e) => {
          e.preventDefault();
          const ok = await confirm({
            title, message,
            confirmLabel: confirmLabel ?? (typeof children === "string" ? children : "Confirm"),
            danger: /danger|red/.test(className ?? ""),
          });
          if (ok && ref.current) ref.current.form?.requestSubmit(ref.current);
        }}
      >
        {children}
      </button>
    </>
  );
}
