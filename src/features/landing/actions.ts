"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { moderateFeedback, removeOwnFeedback, submitFeedback } from "./feedback";
import { moveImage, removeImage, restoreImage, setShowOnLanding, updateImageAlt } from "./images";

// Every action re-checks authority on the server (landing.manage for System Admin; own entry only for feedback). The
// buttons that call them are hidden from everyone else, but that is never the protection.

export type LandingState = { error?: string; success?: string };

const uuid = z.uuid();
const done = (res: { ok: true } | { ok: false; error: string }, success: string): LandingState => (res.ok ? { success } : { error: res.error });

export async function imageAction(_prev: LandingState, fd: FormData): Promise<LandingState> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("imageId"));
  const op = z.enum(["alt", "up", "down", "remove", "restore"]).safeParse(fd.get("op"));
  if (!id.success || !op.success) return { error: "Invalid request." };
  switch (op.data) {
    case "alt": return done(await updateImageAlt(user, id.data, (fd.get("altText") ?? "").toString()), "Description saved.");
    case "up": case "down": return done(await moveImage(user, id.data, op.data), "Order saved.");
    case "remove": return done(await removeImage(user, id.data), "Picture removed. You can restore it below.");
    case "restore": return done(await restoreImage(user, id.data), "Picture restored.");
  }
}

export async function showOnLandingAction(_prev: LandingState, fd: FormData): Promise<LandingState> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("eventId"));
  if (!id.success) return { error: "Invalid event." };
  const show = fd.get("show") === "true";
  return done(await setShowOnLanding(user, id.data, show), show ? "The event is now on the landing page." : "The event was taken off the landing page.");
}

export async function moderateFeedbackAction(_prev: LandingState, fd: FormData): Promise<LandingState> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("feedbackId"));
  const action = z.enum(["approve", "hide", "delete", "restore"]).safeParse(fd.get("action"));
  if (!id.success || !action.success) return { error: "Invalid request." };
  const label = { approve: "Approved. It is now on the landing page.", hide: "Hidden from the landing page.", delete: "Deleted. You can restore it from the Deleted tab.", restore: "Restored." }[action.data];
  return done(await moderateFeedback(user, id.data, action.data), label);
}

const RATING = "Choose a rating from 1 to 5 stars.";
const feedbackSchema = z.object({
  rating: z.coerce.number({ error: RATING }).int(RATING).min(1, RATING).max(5, RATING),
  comment: z.string().max(2000, "Keep your comment under 500 characters."),
});

export async function submitFeedbackAction(_prev: LandingState, fd: FormData): Promise<LandingState> {
  const user = await requireUser();
  const parsed = feedbackSchema.safeParse({ rating: fd.get("rating") ?? "", comment: (fd.get("comment") ?? "").toString() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your rating." };
  const res = await submitFeedback(user, parsed.data.rating, parsed.data.comment);
  return res.ok ? { success: "Thank you! Your feedback will appear on the landing page once an administrator approves it." } : { error: res.error };
}

export async function removeOwnFeedbackAction(): Promise<LandingState> {
  const user = await requireUser();
  return done(await removeOwnFeedback(user), "Your feedback was removed.");
}
