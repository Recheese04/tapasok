import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// A member's attendance QR is a short-lived signed token: tpk1.<userId>.<window>.<signature>.
// The window rotates every WINDOW_SECONDS, so a screenshot stops working within ~2 minutes.
// The token proves only WHO is presenting it; the scan service separately validates the event,
// its time window, membership and the scanner's authority.

const WINDOW_SECONDS = 60;
const ACCEPT_WINDOWS = 1; // current and previous window (clock skew + scanning delay)

function secret() {
  const s = process.env.QR_SECRET;
  if (!s || s.length < 32) throw new Error("QR_SECRET must be set to at least 32 characters.");
  return s;
}

const windowOf = (ms: number) => Math.floor(ms / 1000 / WINDOW_SECONDS);
const sign = (userId: string, window: number) =>
  createHmac("sha256", secret()).update(`${userId}.${window}`).digest("base64url").slice(0, 22);

export function makeMemberQr(userId: string, now = Date.now()) {
  const w = windowOf(now);
  return `tpk1.${userId}.${w}.${sign(userId, w)}`;
}

export function verifyMemberQr(token: string, now = Date.now()): { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" } {
  const m = /^tpk1\.([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(token.trim());
  if (!m) return { ok: false, reason: "invalid" };
  const [, userId, w, sig] = m;
  const expected = Buffer.from(sign(userId, Number(w)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  if (windowOf(now) - Number(w) > ACCEPT_WINDOWS || Number(w) > windowOf(now) + 1) return { ok: false, reason: "expired" };
  return { ok: true, userId };
}

// ---- Session check-in QR (Method B): displayed by officers, scanned by students on their own phones.
// Format tpks2.<sessionId>.<epoch>.<window>.<signature>. It identifies the SESSION only (never a person):
// the student's identity comes from their signed-in account, and eligibility is checked on the server.
//  * the window rotates every minute, so screenshots stop working within about two minutes;
//  * the epoch lives on the session row; an officer bumping it revokes every code issued before;
//  * the signature is an HMAC with a server secret, so codes cannot be forged or guessed.

export function makeSessionQr(sessionId: string, epoch = 0, now = Date.now()) {
  const w = windowOf(now);
  return `tpks2.${sessionId}.${epoch}.${w}.${sign(`session:${sessionId}:${epoch}`, w)}`;
}

export function verifySessionQr(input: string, now = Date.now()): { ok: true; sessionId: string; epoch: number } | { ok: false; reason: "invalid" | "expired" } {
  // Accept the bare token or the full check-in URL that the QR encodes.
  const token = (input.includes("c=") ? decodeURIComponent(input.split("c=").pop() ?? "") : input).trim();
  const m = /^tpks2\.([0-9a-f-]{36})\.(\d{1,9})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return { ok: false, reason: "invalid" };
  const [, sessionId, epoch, w, sig] = m;
  const expected = Buffer.from(sign(`session:${sessionId}:${epoch}`, Number(w)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  if (windowOf(now) - Number(w) > ACCEPT_WINDOWS || Number(w) > windowOf(now) + 1) return { ok: false, reason: "expired" };
  return { ok: true, sessionId, epoch: Number(epoch) };
}

/** The URL encoded in the session QR, so a phone camera opens the check-in page directly. */
export const checkInUrl = (token: string) => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/check-in?c=${encodeURIComponent(token)}`;
