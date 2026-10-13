"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Class for each item inside an ActionMenu (links and buttons look the same). */
export const menuItem = "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-sidebar focus:bg-sidebar focus:outline-none";
export const menuItemDanger = "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/5 focus:bg-danger/5 focus:outline-none";

/**
 * A compact "Actions" menu for table rows, so each row shows one button instead of many. Opens below the button, closes on
 * Escape, on a click outside or after an item is chosen, and returns focus to the button. Items are ordinary links, buttons
 * or forms (server actions and confirmations keep working inside it).
 */
export function ActionMenu({ label, children, align = "right" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Move focus to the first item so the menu works from the keyboard.
    wrap.current?.querySelector<HTMLElement>("[role=menu] a, [role=menu] button")?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrap} className="relative inline-block text-left">
      <button
        ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-sidebar"
      >
        Actions
        <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="currentColor" aria-hidden="true"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
      </button>
      {/* Always mounted, only hidden: an item such as a confirmed form must survive the menu closing while its dialog is open. */}
      <div
        id={id} role="menu" aria-label={label} hidden={!open}
        // Choosing an item closes the menu (confirmations open their own dialog).
        onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) setOpen(false); }}
        className={`absolute z-30 mt-1 w-52 rounded-xl border border-border bg-surface p-1 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
      >
        {children}
      </div>
    </div>
  );
}
