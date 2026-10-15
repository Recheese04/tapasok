import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { canSystem } from "@/lib/permissions";
import { addEventImage, MAX_INPUT_BYTES } from "@/features/landing/images";

// Uploads one landing-page picture for an event (System Admin only, same origin). A route handler rather than a server
// action so the browser can show upload progress and pictures up to 4 MB are accepted.

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

const TOO_LARGE = "The picture is too large. Use one under 4 MB.";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!canSystem(user, "landing.manage")) return NextResponse.json({ error: "Only system administrators manage landing-page pictures." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_INPUT_BYTES + 64 * 1024) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const eventId = z.uuid().safeParse(form?.get("eventId"));
  const file = form?.get("image");
  if (!eventId.success) return NextResponse.json({ error: "Choose an event." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a picture to upload." }, { status: 400 });
  if (file.size > MAX_INPUT_BYTES) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  const alt = (form?.get("altText") ?? "").toString();
  const res = await addEventImage(user, eventId.data, Buffer.from(await file.arrayBuffer()), alt);
  return res.ok ? NextResponse.json({ ok: true, id: res.id }) : NextResponse.json({ error: res.error }, { status: 422 });
}
