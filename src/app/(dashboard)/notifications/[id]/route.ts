import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/database/client";
import { markRead, safeHref } from "@/features/notifications/service";

// Opening a notification: marks it read, then goes to what it is about. Only the person's own notification is touched;
// any other id simply lands on the notifications page.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const base = new URL(request.url);
  if (!user) return NextResponse.redirect(new URL("/login?next=/notifications", base));
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.redirect(new URL("/notifications", base));
  const n = await db.notification.findFirst({ where: { id, userId: user.id }, select: { href: true } });
  if (n) await markRead(user.id, id);
  return NextResponse.redirect(new URL(safeHref(n?.href ?? null), base));
}
