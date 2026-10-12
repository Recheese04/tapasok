import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { verifySessionQr } from "@/features/attendance/qr";
import { isExpectedAttendee } from "@/features/attendance/eligibility";
import { CheckInForm } from "@/features/attendance/session-forms";

// Public shell (no sidebar) so it works well on a phone after scanning an event QR code.
export default function CheckInPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h1 className="mb-1 text-xl font-semibold">{title}</h1>
      <p className="mb-4 text-sm text-muted">{text}</p>
      <Link href="/dashboard" className="text-sm text-primary hover:underline">Go to Tapasok</Link>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/check-in${c ? `?c=${encodeURIComponent(c)}` : ""}`)}`);
  if (user.mustChangePassword) redirect("/change-password");
  if (!c) return <Problem title="Scan a QR code to check in" text="Check-in starts from the QR code shown by the organizers. Open Scan Attendance QR in Tapasok, or point your phone camera at the code." />;

  const qr = verifySessionQr(c);
  if (!qr.ok) return <Problem title={qr.reason === "expired" ? "Code expired" : "Invalid code"} text={qr.reason === "expired" ? "Scan the QR code currently shown by the officer." : "This is not a valid check-in code."} />;

  const session = await db.eventSession.findUnique({ where: { id: qr.sessionId }, include: { event: { include: { organization: { select: { name: true } } } } } });
  // Event details are only shown to people on the attendee list.
  if (!session || !(await isExpectedAttendee(session.event, user.id))) return <Problem title="Not on the attendee list" text="You are not an expected attendee of this event, or the code is no longer valid." />;

  if (session.qrEpoch !== qr.epoch) return <Problem title="Code revoked" text="This QR code was revoked. Scan the code that is currently displayed." />;
  return (
    <CheckInForm
      token={c} eventTitle={session.event.title} organization={session.event.organization.name} sessionLabel={session.label} venue={session.event.venue}
      when={`${formatDateTime(session.event.startsAt)} – ${formatDateTime(session.event.endsAt)}`}
    />
  );
}
