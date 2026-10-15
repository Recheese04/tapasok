import { redirect } from "next/navigation";
import { Badge, Card, Page, PageHeader } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { canPostFeedback, MAX_COMMENT, myFeedback } from "@/features/landing/feedback";
import { FeedbackForm } from "@/features/landing/feedback-form";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const STATUS = {
  PENDING: { tone: "amber", text: "Waiting for approval", hint: "An administrator reviews feedback before it appears on the landing page." },
  APPROVED: { tone: "green", text: "Shown on the landing page", hint: "Editing it sends it back for approval." },
  HIDDEN: { tone: "gray", text: "Not shown", hint: "An administrator chose not to show this feedback. You can edit it and send it again." },
} as const;

export default async function FeedbackPage() {
  const user = await requireUser();
  if (!canPostFeedback(user)) redirect("/dashboard");
  const mine = await myFeedback(user.id);
  const status = mine ? STATUS[mine.status] : null;
  return (
    <Page>
      <PageHeader title="Rate Tapasok" subtitle="Tell us how Tapasok works for you. Approved ratings and comments appear on the public landing page." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title={mine ? "Your feedback" : "Leave feedback"}>
          <FeedbackForm initial={mine ? { rating: mine.rating, comment: mine.comment ?? "" } : null} max={MAX_COMMENT} />
        </Card>
        <Card title="Status">
          {status && mine ? (
            <div className="flex flex-col gap-2 text-sm">
              <p><Badge tone={status.tone}>{status.text}</Badge></p>
              <p className="text-muted">{status.hint}</p>
              <p className="text-xs text-muted">Last changed {formatDateTime(mine.updatedAt)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">You have not rated Tapasok yet. One rating per account; you can change it at any time.</p>
          )}
        </Card>
      </div>
    </Page>
  );
}
