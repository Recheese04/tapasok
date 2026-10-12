import { Suspense } from "react";
import Link from "next/link";
import { lookupActivation } from "@/features/auth/activation";
import { ActivationForm } from "@/features/auth/activation-form";
import { AuthShell } from "@/features/landing/auth-shell";

export default function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <AuthShell title="Set up your account" subtitle="One step and you're in.">
      <Suspense fallback={<p className="text-sm text-muted">Checking your link…</p>}>
        <Body params={params} />
      </Suspense>
    </AuthShell>
  );
}

async function Body({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = token.length >= 20 && token.length <= 200 ? await lookupActivation(token) : null;

  if (!info) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-danger/25 bg-danger/5 p-5">
        <h2 className="text-lg font-semibold">This link can&apos;t be used</h2>
        <p className="text-sm text-muted">It is invalid, already used, or expired. Ask your administrator for a new setup link.</p>
        <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">Go to sign in</Link>
      </div>
    );
  }
  return <ActivationForm token={token} firstName={info.firstName} />;
}
