import Link from "next/link";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { deleteAnnouncementAction } from "@/features/announcements/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Badge, ButtonLink, Card, Page, PageHeader } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { orgIdsWith, requireOrgPermissionAnywhere, canOrg } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { audienceMatches } from "@/features/announcements/service";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireOrgPermissionAnywhere("announcements.view");
  const page = parsePage((await searchParams).page);
  const manageIds = orgIdsWith(user, "announcements.manage");
  const where = {
    organizationId: { in: orgIdsWith(user, "announcements.view") },
    OR: [{ status: "PUBLISHED" as const }, { organizationId: { in: manageIds } }],
  };
  const candidates = await db.announcement.findMany({
    where, orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 200,
    include: { organization: { select: { name: true } }, author: { select: { firstName: true, lastName: true } }, semester: { select: { name: true, schoolYear: { select: { label: true } } } } },
  });
  // Audience targeting: members only see announcements aimed at them; officers who oversee the organization see all.
  const visible: typeof candidates = [];
  for (const a of candidates) {
    const overseer = canOrg(user, "announcements.manage", a.organizationId) || canOrg(user, "members.roster", a.organizationId);
    if (await audienceMatches(a, user.id, overseer)) visible.push(a);
  }
  const total = visible.length;
  const rows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Page>
      <PageHeader title="Announcements" subtitle="News from your organizations." actions={manageIds.length > 0 && <ButtonLink href="/announcements/new">New announcement</ButtonLink>} />
      {rows.length === 0 ? <EmptyState title="No announcements yet" /> : (
        <div className="flex flex-col gap-4">
          {rows.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-medium">{a.title}</h2>
                <div className="flex items-center gap-2">
                  {a.status === "DRAFT" && <Badge tone="amber">Draft</Badge>}
                  {a.targetMode === "FILTERED" && <Badge>Targeted</Badge>}
                  {canOrg(user, "announcements.manage", a.organizationId) && <><Link className="text-sm text-primary hover:underline" href={`/announcements/${a.id}`}>Edit</Link>
                    <form action={deleteAnnouncementAction}><input type="hidden" name="announcementId" value={a.id} /><ConfirmButton message={`Delete "${a.title}" permanently?`} className="text-sm text-danger hover:underline">Delete</ConfirmButton></form></>}
                </div>
              </div>
              <p className="text-xs text-muted">{a.organization.name} · {a.author ? `${a.author.firstName} ${a.author.lastName} · ` : ""}{formatDateTime(a.publishedAt ?? a.createdAt)}{a.semester ? ` · ${a.semester.schoolYear.label} ${a.semester.name}` : ""}</p>
              <p className="mt-2 whitespace-pre-line text-sm">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} basePath="/announcements" />
    </Page>
  );
}
