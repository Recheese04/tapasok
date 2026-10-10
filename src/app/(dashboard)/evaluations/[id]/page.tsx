import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, Card, Notice, Page, PageHeader, secondaryButton, primaryButton, dangerButton } from "@/components/shared/ui";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { ModalButton } from "@/components/shared/modal";
import { requireUser } from "@/lib/auth/dal";
import { getEvaluationForViewer, getResults } from "@/features/evaluations/queries";
import { deleteEvaluationAction, deleteQuestionAction, setEvaluationStatusAction } from "@/features/evaluations/actions";
import { AddQuestionForm, AnswerForm, EditEvaluationButton, EditQuestionButton } from "@/features/evaluations/forms";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getEvaluationForViewer(user, id);
  if (!data) notFound();
  const { form, manage, canViewResults, canAnswer, attended, submitted } = data;
  const results = canViewResults ? await getResults(user, id) : null;
  const responseCount = results?.responses ?? 0;

  const statusForm = (status: "DRAFT" | "OPEN" | "CLOSED", label: string, confirm: string, style: "primary" | "secondary" = "secondary") => (
    <form action={setEvaluationStatusAction}>
      <input type="hidden" name="formId" value={form.id} />
      <input type="hidden" name="status" value={status} />
      <ConfirmButton title={label} confirmLabel={label} message={confirm} className={style === "primary" ? primaryButton : secondaryButton}>{label}</ConfirmButton>
    </form>
  );
  const tone = form.status === "OPEN" ? "green" : form.status === "CLOSED" ? "gray" : "amber";

  return (
    <Page>
      <PageHeader
        title={form.title}
        subtitle={`${form.organization.name} · Event: ${form.event.title}`}
        actions={manage && (
          <>
            <EditEvaluationButton formId={form.id} title={form.title} />
            {form.status === "DRAFT" && form.questions.length > 0 && statusForm("OPEN", "Open for responses", "Open this evaluation to attendees? Questions can no longer be changed.", "primary")}
            {form.status === "OPEN" && statusForm("CLOSED", "Close evaluation", "Close this evaluation? Members will no longer be able to submit.")}
            {form.status === "CLOSED" && statusForm("OPEN", "Reopen", "Reopen this evaluation so attendees can submit again?")}
            {form.status === "OPEN" && responseCount === 0 && statusForm("DRAFT", "Unpublish", "Return this evaluation to draft? Nobody has answered yet, so nothing is lost.")}
            {form.status === "DRAFT" && (
              <form action={deleteEvaluationAction}>
                <input type="hidden" name="formId" value={form.id} />
                <ConfirmButton title="Delete draft evaluation?" confirmLabel="Delete" message="Delete this draft evaluation and its questions? An evaluation that was opened is closed instead of deleted." className={dangerButton}>Delete draft</ConfirmButton>
              </form>
            )}
          </>
        )}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <Badge tone={tone}>{form.status.charAt(0) + form.status.slice(1).toLowerCase()}</Badge>
        <Link className="text-primary hover:underline" href={`/events/${form.event.id}`}>Open the event</Link>
      </div>

      {manage && form.status === "DRAFT" && (
        <Card
          title="Questions"
          action={<ModalButton label="+ Add question" variant="secondary" title="Add a question" size="md"><AddQuestionForm formId={form.id} /></ModalButton>}
        >
          {form.questions.length === 0 ? <p className="text-sm text-muted">No questions yet. Add at least one to open the evaluation.</p> : (
            <ol className="flex flex-col divide-y divide-border text-sm">
              {form.questions.map((q) => (
                <li key={q.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span>{q.position}. {q.prompt} <span className="text-muted">({q.type.toLowerCase()}{q.required ? ", required" : ""})</span></span>
                  <span className="flex shrink-0 items-center gap-3">
                    <EditQuestionButton questionId={q.id} prompt={q.prompt} required={q.required} />
                    <form action={deleteQuestionAction}>
                      <input type="hidden" name="questionId" value={q.id} />
                      <ConfirmButton title="Remove question?" confirmLabel="Remove" message="Remove this question from the evaluation?" className="text-sm font-medium text-danger hover:underline">Remove</ConfirmButton>
                    </form>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {form.status !== "DRAFT" && (
        canAnswer ? <AnswerForm formId={form.id} questions={form.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options, required: q.required }))} />
        : submitted ? <Notice kind="success">You have submitted this evaluation. Thank you!</Notice>
        : form.status === "CLOSED" ? <Notice kind="info">This evaluation is closed.</Notice>
        : !attended ? <Notice kind="info">Only members who attended the event can submit this evaluation.</Notice> : null
      )}

      {results && form.status !== "DRAFT" && (
        <Card title={`Results (${results.responses} of ${results.eligible} attendees · ${results.eligible ? Math.round((results.responses / results.eligible) * 100) : 0}% response rate)`}>
          <div className="flex flex-col gap-5 text-sm">
            {results.questions.map((q) => (
              <section key={q.id} aria-label={q.prompt}>
                <h3 className="font-medium">{q.prompt}</h3>
                {(q.type === "RATING" || q.type === "LIKERT") && (
                  <>
                    <p>Average: {q.average ?? "—"} / 5 ({q.count} answers)</p>
                    <table className="mt-1 text-xs"><tbody>{q.distribution.map((c, i) => <tr key={i}><td className="pr-3">{i + 1} star{i ? "s" : ""}</td><td>{c}</td></tr>)}</tbody></table>
                  </>
                )}
                {q.type === "CHOICE" && <ul>{q.counts.map((c) => <li key={c.option}>{c.option}: {c.count}</li>)}</ul>}
                {q.type === "TEXT" && (q.answers.length ? <ul className="list-disc pl-5">{q.answers.map((a, i) => <li key={i} className="whitespace-pre-line">{a}</li>)}</ul> : <p className="text-muted">No comments.</p>)}
              </section>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Responses are anonymous: results show aggregates only.</p>
        </Card>
      )}
    </Page>
  );
}
