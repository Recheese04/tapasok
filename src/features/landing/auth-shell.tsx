import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/layout/icons";
import { Logo } from "./brand";
import { FloatingChip } from "./mockups";

/**
 * Frame for the sign-in and account-setup pages: a brand panel on the left (large screens) and the form on the right.
 * Uses the same tokens, mark and illustration pieces as the landing page so the hand-off feels like one product.
 */
export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-screen w-full bg-surface lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between" aria-label="About Tapasok">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_70%)]" aria-hidden="true" />
        <div className="absolute -bottom-40 -right-40 h-[480px] w-[480px] rounded-full bg-primary/45 blur-3xl" aria-hidden="true" />
        <div className="relative"><Logo tone="light" /></div>
        <div className="relative flex max-w-md flex-col gap-6">
          <h2 className="text-balance text-4xl font-semibold leading-tight tracking-tight">Attendance, dues and events, in one place.</h2>
          <ul className="flex flex-col gap-3 text-[#d9d2f2]">
            {["Check in by QR or RFID in seconds", "Every payment verified and receipted", "Tools that follow your position"].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10"><Icon name="check" className="h-4 w-4 text-[#b794ff]" /></span>{t}</li>
            ))}
          </ul>
          <div className="relative mt-4 h-28">
            <FloatingChip icon="check" title="Checked in · Present" sub="General Assembly, 4:02 PM" className="drift absolute left-0 top-0" />
            <FloatingChip icon="wallet" title="Payment confirmed" sub="Receipt TPK-20261012-7QX4" className="drift-slow absolute left-24 top-14" />
          </div>
        </div>
        <p className="relative text-sm text-[#a59dc8]">© 2026 Tapasok · Student organization management</p>
      </aside>

      <main className="relative flex flex-col bg-[#faf9fd] lg:bg-surface">
        <div className="bg-grid absolute inset-x-0 top-0 h-64 [mask-image:linear-gradient(to_bottom,black,transparent)] lg:hidden" aria-hidden="true" />
        <div className="relative flex items-center justify-between px-5 py-5 sm:px-10">
          <span className="lg:invisible"><Logo /></span>
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:bg-primary-soft hover:text-primary">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16 10H4m5-5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to home
          </Link>
        </div>
        <div className="relative flex flex-1 items-center justify-center px-5 pb-16 sm:px-10">
          <div className="rise w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 text-muted">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
