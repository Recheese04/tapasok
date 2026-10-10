import { redirect } from "next/navigation";

// Redirect-only route kept for old links; nothing to validate.
export const instant = false;

export default async function StudentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/users/${encodeURIComponent(id)}`);
}
