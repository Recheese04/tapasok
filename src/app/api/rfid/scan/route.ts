import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/features/attendance/devices";
import { consumeEnrollment } from "@/features/attendance/rfid-enrollment";
import { MESSAGES, rfidTap } from "@/features/attendance/service";

// Integration endpoint for RFID terminals (for example RC522 + NodeMCU over HTTPS).
//   POST /api/rfid/scan   Authorization: Bearer <device key>
//   body: { "sessionId": "<uuid>", "cardUid": "04A1B2C3" }
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

  if (!parsed.data.sessionId) return NextResponse.json({ ok: false, code: "bad_request", message: "sessionId is required to record attendance." }, { status: 400 });
  const res = await rfidTap(device, parsed.data.sessionId, parsed.data.cardUid.replace(/[\s:-]/g, ""));
  if (res.ok) return NextResponse.json({ ok: true, status: res.status, name: res.firstName });
  return NextResponse.json({ ok: false, code: res.reason, message: MESSAGES[res.reason] }, { status: res.reason === "duplicate" ? 200 : 422 });
}
