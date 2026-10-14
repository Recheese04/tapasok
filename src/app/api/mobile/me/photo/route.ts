import { authed, fail, json } from "@/lib/mobile/api";
import { MAX_INPUT_BYTES, photoResponse, readPhoto, removeOwnPhoto, setOwnPhoto } from "@/features/profile/photo";

// The signed-in person's OWN profile picture (app). The account comes from the Bearer token only: no user id is accepted.

export const GET = authed(async (user, request) => {
  const photo = await readPhoto(user, user.id);
  return photo ? photoResponse(photo, new URL(request.url).searchParams.has("v")) : fail(404, "NOT_FOUND", "No profile picture.");
});

export const POST = authed(async (user, request) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_INPUT_BYTES + 64 * 1024) return fail(413, "TOO_LARGE", "The picture is too large. Use one under 5 MB.");
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return fail(400, "BAD_REQUEST", "Choose a picture to upload.");
  if (file.size > MAX_INPUT_BYTES) return fail(413, "TOO_LARGE", "The picture is too large. Use one under 5 MB.");
  const res = await setOwnPhoto(user, Buffer.from(await file.arrayBuffer()));
  return res.ok ? json({ ok: true, version: res.version }) : fail(422, "REJECTED", res.error);
});

export const DELETE = authed(async (user) => {
  const res = await removeOwnPhoto(user);
  return res.ok ? json({ ok: true }) : fail(422, "REJECTED", res.error);
});
