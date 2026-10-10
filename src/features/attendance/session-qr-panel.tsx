import { SessionQrDisplay } from "./session-forms";
import { SessionToggle } from "./session-toggle";

/**
 * Everything an organizer needs for one session's QR: the code (when the session can take check-ins), or the reason it
 * cannot and the control to fix it. Sessions start deactivated, so the panel never just shows an error.
 */
export function SessionQrPanel({ sessionId, active, finalized, published }: { sessionId: string; active: boolean; finalized: boolean; published: boolean }) {
  if (finalized) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">This session is finalized. Its QR codes no longer accept check-ins.</p>;
  if (!published) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">Publish the event first. Check-in codes only work for published events.</p>;
  const toggle = (next: boolean) => <SessionToggle sessionId={sessionId} next={next} />;
  if (!active) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">This session is not open for check-in yet, so its QR code is hidden. Open it when attendance should start.</p>
        {toggle(true)}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-4">
      <SessionQrDisplay sessionId={sessionId} />
      {toggle(false)}
    </div>
  );
}
