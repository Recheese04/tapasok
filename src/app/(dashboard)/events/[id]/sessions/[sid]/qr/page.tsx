import { notFound } from "next/navigation";
import { z } from "zod";
import { Page, PageHeader } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { requireUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions";
import { SessionQrPanel } from "@/features/attendance/session-qr-panel";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function SessionQrPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const user = await requireUser();
  const { id, sid } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(sid).success) notFound();
  const s = await db.eventSession.findFirst({ where: { id: sid, eventId: id }, include: { event: { select: { title: true, status: true, organizationId: true } } } });
  // Not found for anyone who may not operate the scanner of this organization.
  if (!s || !canOrg(user, "attendance.scan", s.event.organizationId)) notFound();
  return (
    <Page>
      <PageHeader title={`${s.event.title} — ${s.label}`} subtitle="Show this code on a screen for members to scan. Each session has its own code." />
      <SessionQrPanel sessionId={s.id} active={s.active} finalized={!!s.finalizedAt} published={s.event.status === "PUBLISHED"} />
    </Page>
  );
}
