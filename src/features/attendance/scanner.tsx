"use client";

import type { ScanActionResult } from "./actions";

const TONE: Record<string, string> = { ok: "border-success text-success", dup: "border-warning text-warning", bad: "border-danger text-danger" };

export function ResultBanner({ result, recordedLabel = "Recorded" }: { result: ScanActionResult; recordedLabel?: string }) {
  const tone = result.ok ? "ok" : result.reason === "duplicate" ? "dup" : "bad";
  const title = result.ok ? recordedLabel : result.reason === "duplicate" ? "Already recorded" : result.reason === "expired" ? "Expired code" : result.reason === "revoked" ? "Revoked code" : "Not recorded";
  return (
    <div role="status" aria-live="assertive" className={`rounded-xl border-2 px-4 py-3 ${TONE[tone]}`}>
      <p className="text-lg font-semibold">{title}</p>
      {result.ok ? (
        <p className="text-sm">{result.attendee} &middot; {result.status === "LATE" ? "Late" : "Present"}</p>
      ) : (
        <p className="text-sm">{result.message}{result.attendee ? ` (${result.attendee})` : ""}</p>
      )}
    </div>
  );
}
