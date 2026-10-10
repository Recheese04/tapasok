import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; activated?: string }> }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<LoginForm />}>
        <WithParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function WithParams({ searchParams }: { searchParams: Promise<{ next?: string; activated?: string }> }) {
  const { next, activated } = await searchParams;
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {activated && <p role="status" className="rounded-lg border border-success px-3 py-2 text-sm text-success">Your password is set. Sign in to continue.</p>}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}
