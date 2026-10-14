import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { MAX_INPUT_BYTES, removeOwnPhoto, setOwnPhoto } from "@/features/profile/photo";

// The signed-in person's OWN profile picture (web). There is no user id in the request: the account always comes from the
// session cookie, so nobody can change another person's picture. Same-origin only.

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_INPUT_BYTES + 64 * 1024) return NextResponse.json({ error: "The picture is too large. Use one under 5 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a picture to upload." }, { status: 400 });
  if (file.size > MAX_INPUT_BYTES) return NextResponse.json({ error: "The picture is too large. Use one under 5 MB." }, { status: 413 });
  const res = await setOwnPhoto(user, Buffer.from(await file.arrayBuffer()));
  return res.ok ? NextResponse.json({ ok: true, version: res.version }) : NextResponse.json({ error: res.error }, { status: 422 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const res = await removeOwnPhoto(user);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 422 });
}
