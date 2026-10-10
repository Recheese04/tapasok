"use client";

import { useState } from "react";
import { Badge } from "@/components/shared/ui";

type Item = { id: string; label: string; detail: string; status: string; tone: "green" | "amber" | "gray"; panel: React.ReactNode };

/**
 * QR-only content of the QR Code dialog: one tab per attendance session of the event (each session has its own code).
 * Only the selected session's panel is mounted, so only that session's code is requested and rotated.
 */
export function QrSessionTabs({ items, initialId }: { items: Item[]; initialId?: string }) {
  const [selected, setSelected] = useState(items.find((i) => i.id === initialId)?.id ?? items[0]?.id);
  const current = items.find((i) => i.id === selected);
  if (items.length === 0) return <p className="text-sm text-muted">This event has no attendance sessions.</p>;
  return (
    <div className="flex flex-col gap-4">
      {items.length > 1 && (
        <div role="tablist" aria-label="Attendance sessions" className="flex flex-wrap gap-2">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              role="tab"
              id={`qr-tab-${i.id}`}
              aria-selected={i.id === selected}
              aria-controls={`qr-panel-${i.id}`}
              onClick={() => setSelected(i.id)}
              className={`rounded-xl border px-3 py-1.5 text-sm ${i.id === selected ? "border-primary bg-primary-soft font-medium text-primary" : "border-border bg-surface text-muted hover:border-primary/40"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
      {current && (
        <div role="tabpanel" id={`qr-panel-${current.id}`} aria-labelledby={`qr-tab-${current.id}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{current.label} · {current.detail}</p>
            <Badge tone={current.tone}>{current.status}</Badge>
          </div>
          {current.panel}
        </div>
      )}
    </div>
  );
}
