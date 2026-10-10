import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/features/attendance/devices";
import { MESSAGES, rfidTap } from "@/features/attendance/service";

// Integration endpoint for RFID terminals (for example RC522 + NodeMCU over HTTPS).
//   POST /api/rfid/scan   Authorization: Bearer <device key>
//   body: { "sessionId": "<uuid>", "cardUid": "04A1B2C3" }
// Responses: 200 { ok: true, status: "PRESENT" | "LATE", name } or { ok: false, code, message }.
// Duplicate taps are rejected by the same rules as every other capture method, so retries are safe.
const bodySchema = z.object({ sessionId: z.uuid(), cardUid: z.string().trim().regex(/^[0-9A-Fa-f]{4,20}$/) });

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : request.headers.get("x-device-key");
  const device = await authenticateDevice(key);
  if (!device) return NextResponse.json({ ok: false, code: "unauthorized", message: "Unknown or revoked device." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "bad_request", message: "sessionId and a hexadecimal cardUid are required." }, { status: 400 });

  const res = await rfidTap(device, parsed.data.sessionId, parsed.data.cardUid);
  if (res.ok) return NextResponse.json({ ok: true, status: res.status, name: res.firstName });
  return NextResponse.json({ ok: false, code: res.reason, message: MESSAGES[res.reason] }, { status: res.reason === "duplicate" ? 200 : 422 });
}
