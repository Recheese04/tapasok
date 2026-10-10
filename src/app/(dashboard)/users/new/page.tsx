import { redirect } from "next/navigation";

// Creating an account happens in a dialog on the User Management page. This route stays so old links keep working.
export const instant = false;

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  redirect(`/users?new=${encodeURIComponent(type ?? "STUDENT")}`);
}
