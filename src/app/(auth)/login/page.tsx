import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { AuthShell } from "@/features/landing/auth-shell";

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
  const { next, activated } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      {activated && <p role="status" className="rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-sm text-success">Your password is set. Sign in to continue.</p>}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
