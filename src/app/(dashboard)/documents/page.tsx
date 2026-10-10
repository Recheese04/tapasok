import { EmptyState } from "@/components/shared/empty-state";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/shared/pagination";
import { Page, PageHeader, Table, Td } from "@/components/shared/ui";
import { ModalButton } from "@/components/shared/modal";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith, requireOrgPermissionAnywhere } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { removeDocumentAction } from "@/features/documents/actions";
import { UploadForm } from "@/features/documents/upload-form";
import { DocumentEdit } from "@/features/documents/document-edit";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const CATEGORY = { MINUTES: "Meeting minutes", ATTENDANCE_SHEET: "Attendance sheet", RESOLUTION: "Resolution", EVENT_DOCUMENT: "Event document", OTHER: "Other" } as const;
const size = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireOrgPermissionAnywhere("documents.view");
  const page = parsePage((await searchParams).page);
  const where = { organizationId: { in: orgIdsWith(user, "documents.view") }, deletedAt: null };
  const [total, rows] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, title: true, description: true, fileName: true, sizeBytes: true, createdAt: true, organizationId: true, category: true, organization: { select: { name: true } }, semester: { select: { name: true, schoolYear: { select: { label: true } } } }, event: { select: { title: true } } },
    }),
  ]);
  const manageIds = orgIdsWith(user, "documents.manage");
  const organizations = [...new Map(user.memberships.filter((m) => manageIds.includes(m.organizationId)).map((m) => [m.organizationId, { id: m.organizationId, name: m.organizationName }])).values()];

  // Minutes and records are auditable: presidents and advisers can see who uploaded, downloaded or removed files.
  const auditOrgIds = orgIdsWith(user, "documents.audit");
  const auditDocs = auditOrgIds.length ? await db.document.findMany({ where: { organizationId: { in: auditOrgIds } }, select: { id: true, title: true } }) : [];
  const titles = new Map(auditDocs.map((d) => [d.id, d.title]));
  const audit = auditDocs.length ? await db.auditLog.findMany({ where: { targetType: "document", targetId: { in: auditDocs.map((d) => d.id) } }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, action: true, targetId: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } } }) : [];
  const events = manageIds.length ? await db.event.findMany({ where: { organizationId: { in: manageIds } }, orderBy: { startsAt: "desc" }, take: 50, select: { id: true, title: true } }) : [];

  return (
    <Page>
      <PageHeader title="Documents" subtitle="Files shared with your organizations." actions={organizations.length > 0 && (<ModalButton label="+ Upload document" variant="primary" title="Upload document" description="PDF, image or office file up to 10 MB. Visible to members of the chosen organization." size="md"><UploadForm organizations={organizations} events={events} /></ModalButton>)} />
      {rows.length === 0 ? <EmptyState title="No documents yet" /> : (
        <Table head={["Document", "Organization", "File", "Term", "Added", ""]}>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{CATEGORY[d.category]}{d.event ? ` · ${d.event.title}` : ""}</div>{d.description && <div className="text-xs text-muted">{d.description}</div>}</Td>
              <Td>{d.organization.name}</Td>
              <Td>{d.fileName} <span className="text-muted">({size(d.sizeBytes)})</span></Td>
              <Td>{d.semester ? `${d.semester.schoolYear.label} ${d.semester.name}` : "—"}</Td>
              <Td>{formatDate(d.createdAt)}</Td>
              <Td>
                <div className="flex gap-3">
                  <a className="text-primary hover:underline" href={`/documents/${d.id}/download`} download>Download</a>
                  {canOrg(user, "documents.manage", d.organizationId) && <DocumentEdit id={d.id} title={d.title} description={d.description ?? ""} category={d.category} />}
                  {canOrg(user, "documents.manage", d.organizationId) && (
                    <form action={removeDocumentAction}>
                      <input type="hidden" name="documentId" value={d.id} />
                      <ConfirmButton message={`Remove "${d.title}"? It will no longer be available to members.`} className="text-danger hover:underline">Remove</ConfirmButton>
                    </form>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination page={page} total={total} basePath="/documents" />
      
      {audit.length > 0 && (
        <section aria-labelledby="doc-audit" className="flex flex-col gap-3">
          <h2 id="doc-audit" className="font-medium">Document activity</h2>
          <Table head={["When", "Who", "Action", "Document"]}>
            {audit.map((a) => <tr key={a.id}><Td>{formatDateTime(a.createdAt)}</Td><Td>{a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : "—"}</Td><Td>{a.action.replace("document.", "")}</Td><Td>{titles.get(a.targetId ?? "") ?? "—"}</Td></tr>)}
          </Table>
        </section>
      )}
    </Page>
  );
}
