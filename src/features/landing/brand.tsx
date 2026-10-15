import Image from "next/image";
import Link from "next/link";
import mark from "./assets/logo-mark.png";

/** The Tapasok mark: graduation cap over the "T", tap signal and members (the app icon without the lettering). */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return <Image src={mark} alt="" aria-hidden="true" className={`rounded-[26%] ${className}`} priority />;
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Tapasok home">
      <LogoMark />
      <span className={`text-lg font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-foreground"}`}>Tapasok</span>
    </Link>
  );
}
