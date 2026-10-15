import { ConfirmButton } from "@/components/shared/confirm-button";
import { Badge } from "@/components/shared/ui";
import { formatDateTime } from "@/lib/format";

export type DeletedItem = { id: string; title: string; detail?: string; deletedAt: Date; deletedBy?: string | null };

/**
 * "Recently deleted" panel: soft-deleted records the viewer may restore. Collapsed by default so it never crowds the
 * normal list. The action receives the record id in `field`; the server re-checks permission before restoring.
 */
export function DeletedList({ items, action, field, noun }: { items: DeletedItem[]; action: (fd: FormData) => Promise<void>; field: string; noun: string }) {
  if (items.length === 0) return null;
  return (
    <details className="group rounded-2xl border border-dashed border-border bg-surface p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium">
        <span>Recently deleted {noun}s <span className="text-muted">({items.length})</span></span>
        <span className="text-xs text-muted group-open:hidden">Show</span>
      </summary>
      <p className="mt-2 text-xs text-muted">Deleted {noun}s are hidden from everyone. Restore one to bring it back exactly as it was.</p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="truncate">{d.title}</span><Badge tone="red">Deleted</Badge></p>
              <p className="text-xs text-muted">
                {d.detail ? `${d.detail} · ` : ""}Deleted {formatDateTime(d.deletedAt)}{d.deletedBy ? ` by ${d.deletedBy}` : ""}
              </p>
            </div>
            <form action={action}>
              <input type="hidden" name={field} value={d.id} />
              <ConfirmButton title={`Restore this ${noun}?`} message={`"${d.title}" will be visible again where it was before.`} confirmLabel="Restore" className="text-sm font-medium text-primary hover:underline">Restore</ConfirmButton>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
