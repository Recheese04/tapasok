import { Suspense } from "react";
import { requireUserForPasswordChange } from "@/lib/auth/dal";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { AuthShell } from "@/features/landing/auth-shell";

// Reads the session on every request (who is signed in, and whether they still have the shared password).
export const instant = false;

export default function ChangePasswordPage() {
  return (
    <AuthShell title="Choose your password" subtitle="One more step before you start using Tapasok.">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Gate />
      </Suspense>
    </AuthShell>
  );
}

async function Gate() {
  await requireUserForPasswordChange(); // signed-out visitors go to /login
  return <ChangePasswordForm />;
}
