import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/features/attendance/devices";
import { consumeEnrollment } from "@/features/attendance/rfid-enrollment";
import { MESSAGES, openSessionsFor, rfidTap } from "@/features/attendance/service";
import { logRejectedTap } from "@/features/attendance/live";

// Integration endpoint for RFID terminals (for example RC522 + NodeMCU over HTTPS).
//   POST /api/rfid/scan   Authorization: Bearer <device key>
//   body: { "cardUid": "04A1B2C3" }  (optional "sessionId": "<uuid>" pins the tap to one session)
// Without a sessionId the tap goes to the single session of the terminal's organization that an officer has activated and
// that is open now; none open or several open is refused with a message (never guessed).
// Responses: 200 { ok: true, status: "PRESENT" | "LATE", name } or { ok: false, code, message }.
// Duplicate taps are rejected by the same rules as every other capture method, so retries are safe.
//
// Card registration: while a System Admin has opened "Scan RFID card" for a student on this terminal, the next tap is
// captured for registration instead of recording attendance. The admin confirms the detected UID on the website before it
// is saved. Response: { ok: true, registered: true, captured: true, name } ("registered" is kept for terminals running the
// first firmware; it means the tap was taken for registration). sessionId is not needed for that tap.
const bodySchema = z.object({ sessionId: z.uuid().optional(), cardUid: z.string().trim().regex(/^[0-9A-Fa-f:\- ]{4,30}$/) });

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : request.headers.get("x-device-key");
  const device = await authenticateDevice(key);
  if (!device) return NextResponse.json({ ok: false, code: "unauthorized", message: "Unknown or revoked device." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "bad_request", message: "A hexadecimal cardUid is required." }, { status: 400 });

  const enrolled = await consumeEnrollment(device.id, parsed.data.cardUid);
  if (enrolled) {
    return enrolled.ok
      ? NextResponse.json({ ok: true, registered: true, captured: true, name: enrolled.name })
      : NextResponse.json({ ok: false, code: "register_failed", message: enrolled.message }, { status: 409 });
  }

  // No session named by the terminal: use the one session an officer has activated for this terminal's organization.
  const cardUid = parsed.data.cardUid.replace(/[\s:-]/g, "").toUpperCase();
  let sessionId = parsed.data.sessionId;
  let sessionName: string | undefined;
  if (!sessionId) {
    const open = await openSessionsFor(device.organizationId);
    if (open.length === 0) {
      await logRejectedTap(device, "no_open_session", cardUid, null);
      return NextResponse.json({ ok: false, code: "no_open_session", message: "No attendance is open right now. An officer must open check-in for the session (Activate scanner on the website, or Open in the app)." }, { status: 422 });
    }
    if (open.length > 1) {
      const names = open.map((s) => `${s.event.title} (${s.label})`).join(", ");
      await logRejectedTap(device, "several_open_sessions", cardUid, null);
      return NextResponse.json({ ok: false, code: "several_open_sessions", message: `More than one session is open: ${names}. Deactivate the one not in use.` }, { status: 409 });
    }
    sessionId = open[0].id;
    sessionName = `${open[0].event.title} · ${open[0].label}`;
  }
  const res = await rfidTap(device, sessionId, cardUid);
  if (res.ok) return NextResponse.json({ ok: true, status: res.status, name: res.firstName, ...(sessionName ? { session: sessionName } : {}) });
  // Refused taps are logged (never as attendance) so the officers' live monitor can show why a tap did not count.
  await logRejectedTap(device, res.reason, cardUid, sessionId);
  return NextResponse.json({ ok: false, code: res.reason, message: MESSAGES[res.reason] }, { status: res.reason === "duplicate" ? 200 : 422 });
}
