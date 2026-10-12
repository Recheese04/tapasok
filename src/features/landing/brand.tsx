import Link from "next/link";

/** The Tapasok mark: a bold "T" on the site's primary purple, matching the app icon's letterform. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M9 8.5h14a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1h-4.6V23a1.5 1.5 0 0 1-1.5 1.5h-1.8a1.5 1.5 0 0 1-1.5-1.5V13.1H9a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" fill="white" />
    </svg>
  );
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Tapasok home">
      <LogoMark />
      <span className={`text-lg font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-foreground"}`}>Tapasok</span>
    </Link>
  );
}
