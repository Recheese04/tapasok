import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { LoginForm } from "@/features/auth/login-form";
import { AuthShell } from "@/features/landing/auth-shell";

// Reads the session: someone already signed in (for example after pressing Back) is sent on instead of seeing the form.
export const instant = false;

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; activated?: string }> }) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to Tapasok with your school email.">
      <Suspense fallback={<LoginForm />}>
        <WithParams searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function WithParams({ searchParams }: { searchParams: Promise<{ next?: string; activated?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  const { next, activated } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      {activated && <p role="status" className="rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-sm text-success">Your password is set. Sign in to continue.</p>}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
