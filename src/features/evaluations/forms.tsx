"use client";

import { useActionState } from "react";
import { ModalButton } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { addQuestionAction, createEvaluationAction, submitEvaluationAction, updateEvaluationAction, updateQuestionAction, type EvalState } from "./actions";

export function AddQuestionForm({ formId }: { formId: string }) {
  const [state, action, pending] = useActionState<EvalState, FormData>(addQuestionAction, {});
  return (
    <form action={action} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">Add a question</h3>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <input type="hidden" name="formId" value={formId} />
      <Field id="prompt" label="Question"><input id="prompt" name="prompt" required className={inputClass} /></Field>
      <Field id="type" label="Answer type">
        <select id="type" name="type" className={inputClass}>
          <option value="RATING">Rating (1–5)</option>
          <option value="LIKERT">Likert scale (strongly disagree – strongly agree)</option>
          <option value="TEXT">Free text</option>
          <option value="CHOICE">Multiple choice</option>
        </select>
      </Field>
      <Field id="options" label="Choices (multiple choice only, one per line)"><textarea id="options" name="options" rows={3} className={inputClass} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked /> Required</label>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Adding…" : "Add question"}</button>
    </form>
  );
}

type Q = { id: string; prompt: string; type: "RATING" | "LIKERT" | "TEXT" | "CHOICE"; options: unknown; required: boolean };

export function AnswerForm({ formId, questions }: { formId: string; questions: Q[] }) {
  const [state, action, pending] = useActionState<EvalState, FormData>(submitEvaluationAction, {});
  if (state.success) return <Notice kind="success">{state.success}</Notice>;
  return (
    <form action={action} className="flex max-w-xl flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <input type="hidden" name="formId" value={formId} />
      {questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{q.prompt}{q.required ? " *" : ""}</legend>
          {q.type === "RATING" && (
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name={`q_${q.id}`} value={n} /> {n}</label>
              ))}
              <span className="text-xs text-muted">(1 = poor, 5 = excellent)</span>
            </div>
          )}
          {q.type === "LIKERT" && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"].map((label, i) => (
                <label key={label} className="flex items-center gap-1 text-sm"><input type="radio" name={`q_${q.id}`} value={i + 1} /> {label}</label>
              ))}
            </div>
          )}
          {q.type === "CHOICE" && Array.isArray(q.options) && (q.options as string[]).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm"><input type="radio" name={`q_${q.id}`} value={o} /> {o}</label>
          ))}
          {q.type === "TEXT" && <textarea name={`q_${q.id}`} rows={3} maxLength={1000} className={inputClass} aria-label={q.prompt} />}
        </fieldset>
      ))}
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Submitting…" : "Submit evaluation"}</button>
    </form>
  );
}

/** Pick one of the organization's events that has no evaluation yet. The server re-checks the organization's permission. */
export function CreateEvaluationForm({ events }: { events: { id: string; label: string }[] }) {
  if (events.length === 0) return <p className="text-sm text-muted">Every event of your organizations already has an evaluation, or there are no events yet.</p>;
  return (
    <form action={createEvaluationAction} className="grid gap-3">
      <Field id="ce-event" label="Event" hint="A starter set of questions is added; you can change them before opening it to attendees.">
        <select id="ce-event" name="eventId" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choose an event</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </Field>
      <button type="submit" className={primaryButton}>Create evaluation</button>
    </form>
  );
}

export function EditEvaluationButton({ formId, title }: { formId: string; title: string }) {
  return (
    <ModalButton label="Edit details" title="Edit evaluation" description={title} size="sm">
      <EditEvaluationForm formId={formId} title={title} />
    </ModalButton>
  );
}

function EditEvaluationForm({ formId, title }: { formId: string; title: string }) {
  const [state, action, pending] = useActionState<EvalState, FormData>(updateEvaluationAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="formId" value={formId} />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <Field id="ee-title" label="Title"><input id="ee-title" name="title" required minLength={3} maxLength={150} defaultValue={title} className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

export function EditQuestionButton({ questionId, prompt, required }: { questionId: string; prompt: string; required: boolean }) {
  return (
    <ModalButton label="Edit" variant="link" title="Edit question" size="sm">
      <EditQuestionForm questionId={questionId} prompt={prompt} required={required} />
    </ModalButton>
  );
}

function EditQuestionForm({ questionId, prompt, required }: { questionId: string; prompt: string; required: boolean }) {
  const [state, action, pending] = useActionState<EvalState, FormData>(updateQuestionAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="questionId" value={questionId} />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <Field id="eq-prompt" label="Question"><input id="eq-prompt" name="prompt" required minLength={3} maxLength={300} defaultValue={prompt} className={inputClass} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={required} /> Required</label>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
