import { Suspense } from "react";
import Link from "next/link";
import { lookupActivation } from "@/features/auth/activation";
import { ActivationForm } from "@/features/auth/activation-form";

export default function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<p className="text-sm text-muted">Checking your link…</p>}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = token.length >= 20 && token.length <= 200 ? await lookupActivation(token) : null;

  if (!info) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h1 className="mb-2 text-xl font-semibold">Link not valid</h1>
        <p className="mb-4 text-sm text-muted">This setup link is invalid, already used, or expired. Ask an administrator for a new one.</p>
        <Link href="/login" className="text-sm text-primary hover:underline">Go to sign in</Link>
      </div>
    );
  }
  return <ActivationForm token={token} firstName={info.firstName} />;
}
