import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/layout/icons";
import { Logo, LogoMark } from "@/features/landing/brand";
import { DashboardMockup, FloatingChip, PhoneMockup } from "@/features/landing/mockups";

const DESCRIPTION = "Tapasok: events, QR and RFID attendance, dues and announcements for student organizations, in one place. On the web and on Android.";

// The one page meant for search results: indexed, canonical, with a link preview.
export const metadata: Metadata = {
  title: "Tapasok · Student organization management",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", url: "/", siteName: "Tapasok", title: "Tapasok · Student organization management", description: DESCRIPTION },
  twitter: { card: "summary", title: "Tapasok", description: DESCRIPTION },
};

// The public front door. Static: it reads no session, so it is prerendered and served instantly. Signing in happens on /login.

const NAV = [["Features", "#features"], ["How it works", "#how"], ["For officers", "#roles"], ["Mobile", "#mobile"], ["FAQ", "#faq"]] as const;

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-foreground">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <Proof />
        <Features />
        <HowItWorks />
        <Roles />
        <Mobile />
        <Trust />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const primaryCta = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(106,43,216,0.8)] hover:bg-primary-hover";
const secondaryCta = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white px-6 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary";

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/80 backdrop-blur-xl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <div className={`${container} flex h-16 items-center justify-between gap-4`}>
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground">{label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover sm:inline-flex">Sign in</Link>
          <details className="relative md:hidden">
            <summary aria-label="Menu" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border"><Icon name="menu" /></summary>
            <div className="absolute right-0 top-12 w-60 rounded-2xl border border-border bg-white p-2 shadow-card">
              {NAV.map(([label, href]) => <a key={href} href={href} className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-primary-soft">{label}</a>)}
              <Link href="/login" className="mt-1 block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-semibold text-white">Sign in</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden="true" />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
      <div className={`${container} relative grid items-center gap-14 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24`}>
        <div className="rise flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> For student organizations · web and Android
          </span>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            Run your organization from <span className="bg-gradient-to-r from-primary to-[#a46bff] bg-clip-text text-transparent">one place</span>.
          </h1>
          <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted">
            Tapasok handles check-in, dues, events and announcements for every student organization on campus. Members tap or scan in seconds. Officers see exactly what their position needs.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/login" className={primaryCta}>Sign in to Tapasok <Arrow /></Link>
            <a href="#how" className={secondaryCta}>See how it works</a>
          </div>
          <p className="text-sm text-muted">Use the account your administrator created for you.</p>
        </div>
        <div className="rise-3 relative mx-auto w-full max-w-xl lg:ml-16 lg:max-w-none">
          <DashboardMockup />
          <div className="absolute -bottom-20 -left-6 hidden origin-bottom-left scale-[0.8] sm:block lg:-left-28"><div className="drift"><PhoneMockup /></div></div>
          <FloatingChip icon="check" title="Checked in · Present" sub="General Assembly, 4:02 PM" className="drift-slow absolute -right-2 -top-6 hidden sm:flex lg:-right-6" />
          <FloatingChip icon="wallet" title="Payment confirmed" sub="Receipt TPK-20261012-7QX4" className="drift absolute -bottom-6 right-4 hidden md:flex" />
        </div>
      </div>
    </section>
  );
}

function Arrow() {
  return <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Proof() {
  const items: [string, string][] = [
    ["3 ways to check in", "Session QR, RFID card, or an officer's scanner"],
    ["Every peso traced", "Receipt codes, verified payments, voids kept with a reason"],
    ["7 positions", "Each gets the tools its role allows, nothing more"],
    ["Zero location tracking", "Attendance never reads GPS"],
  ];
  return (
    <section aria-label="At a glance" className="border-y border-border bg-[#faf9fd]">
      <dl className={`${container} grid grid-cols-2 gap-px lg:grid-cols-4`}>
        {items.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 px-2 py-8 sm:px-6">
            <dt className="text-lg font-semibold tracking-tight">{k}</dt>
            <dd className="text-sm text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SectionHead({ eyebrow, title, text, center }: { eyebrow: string; title: string; text: string; center?: boolean }) {
  return (
    <div className={`flex max-w-2xl flex-col gap-3 ${center ? "mx-auto items-center text-center" : ""}`}>
      <span className="text-sm font-semibold text-primary">{eyebrow}</span>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      <p className="text-pretty text-lg leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24">
      <div className={container}>
        <SectionHead eyebrow="Features" title="Everything an organization runs on" text="From the first event of the semester to the last peso collected, the whole year lives in one system that every officer and member shares." />
        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          {/* Attendance: the headline feature */}
          <article className="relative overflow-hidden rounded-3xl bg-ink p-8 text-white lg:col-span-4">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/40 blur-3xl" aria-hidden="true" />
            <div className="relative grid gap-8 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><Icon name="scan" /></span>
                <h3 className="text-2xl font-semibold tracking-tight">Check-in that takes seconds</h3>
                <p className="max-w-md text-[#c9c2e6]">Show a session code on screen and members scan it with their phone, tap an RFID card on a terminal, or have an officer scan IDs at the door. Codes rotate and can be revoked, duplicates are refused, and late arrivals are marked by the grace period you set.</p>
                <ul className="mt-2 grid gap-2 text-sm text-[#e7e2f7] sm:grid-cols-2">
                  {["Session QR, revocable anytime", "RFID cards, tap to register", "Officer scanner for IDs", "Absences marked when you close"].map((t) => (
                    <li key={t} className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-[#b794ff]" />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="mx-auto hidden w-44 flex-col items-center gap-3 rounded-2xl bg-white p-4 text-foreground sm:flex" aria-hidden="true">
                <QrArt />
                <p className="text-xs font-semibold">General Assembly</p>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Open · Session 1</span>
              </div>
            </div>
          </article>
          <Feature className="lg:col-span-2" icon="wallet" title="A ledger you can audit" text="Assessments, waivers and payments in one history. Cash is recorded with a receipt; GCash and bank payments wait for the treasurer to verify. Nothing is deleted, only voided with a reason." />
          <Feature className="lg:col-span-2" icon="calendar" title="Events with real rules" text="Time-in and time-out sessions, cut-offs and grace periods, and audiences by college, program or year level." />
          <Feature className="lg:col-span-2" icon="megaphone" title="Announcements that land" text="Post to everyone or just third-year IT students. Members see it in the app and in their notifications." />
          <Feature className="lg:col-span-2" icon="clipboard" title="Records and follow-ups" text="Minutes and resolutions, post-event evaluations, fines that flow to the ledger, and tasks members can complete." />
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title, text, className = "" }: { icon: IconName; title: string; text: string; className?: string }) {
  return (
    <article className={`group flex flex-col gap-3 rounded-3xl border border-border bg-white p-7 hover:border-primary/30 hover:shadow-card ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon name={icon} /></span>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
    </article>
  );
}

/** Decorative QR-like pattern (not a scannable code). */
function QrArt() {
  const cells = "1110111010110011101101100101101110001101110100111010010110111011101011001110110101100111".split("");
  return (
    <svg viewBox="0 0 11 11" className="h-32 w-32" shapeRendering="crispEdges">
      <rect width="11" height="11" fill="white" />
      {cells.map((c, i) => (c === "1" ? <rect key={i} x={i % 11} y={Math.floor(i / 11)} width="1" height="1" fill="var(--ink)" /> : null))}
      {[[0, 0], [8, 0], [0, 8]].map(([x, y]) => <g key={`${x}${y}`}><rect x={x} y={y} width="3" height="3" fill="var(--ink)" /><rect x={x + 0.6} y={y + 0.6} width="1.8" height="1.8" fill="white" /><rect x={x + 1} y={y + 1} width="1" height="1" fill="var(--primary)" /></g>)}
    </svg>
  );
}

function HowItWorks() {
  const steps: [string, string, string][] = [
    ["Set up the term", "An administrator adds the school year, programs and organizations, then imports students from a CSV. Each person gets one account for every organization they join.", "academic"],
    ["Officers run the year", "Create an event, open check-in, post an announcement, assess dues. Each officer sees the tools their position allows in that organization.", "calendar"],
    ["Members just show up", "Scan or tap in at events, see their attendance and balance, pay in cash or GCash, and get updates on their phone.", "check"],
  ];
  return (
    <section id="how" className="scroll-mt-20 bg-[#faf9fd] py-24">
      <div className={container}>
        <SectionHead center eyebrow="How it works" title="Live in an afternoon, used all year" text="Three roles, one flow. Nobody has to learn more than their part." />
        <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
          <span className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent md:block" aria-hidden="true" />
          {steps.map(([title, text, icon], i) => (
            <li key={title} className="relative flex flex-col items-center gap-4 rounded-3xl border border-border bg-white p-7 text-center">
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_10px_30px_-10px_rgba(106,43,216,0.9)]">
                <Icon name={icon as IconName} className="h-6 w-6" />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-ink text-xs font-bold text-white">{i + 1}</span>
              </span>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Roles() {
  const roles: [string, IconName, string, string[]][] = [
    ["President", "building", "The whole organization at a glance.", ["Members, events and check-in trends", "Payments waiting for verification", "Create events and announcements"]],
    ["Treasurer", "wallet", "Money in, money owed, money verified.", ["Collected, outstanding and awaiting totals", "Confirm GCash payments, record cash", "Balances member by member"]],
    ["Secretary", "file", "Records and communication.", ["Minutes, resolutions and documents", "Announcements to targeted members", "The member roster"]],
    ["Member", "users", "Everything about you, nothing else.", ["Next event and one-tap check-in", "Attendance record and fees", "Announcements and notifications"]],
  ];
  return (
    <section id="roles" className="scroll-mt-20 py-24">
      <div className={container}>
        <SectionHead eyebrow="Built around positions" title="Every officer gets a different Tapasok" text="Positions are bundles of permissions. A President in one organization can be a plain member in another, and each organization shows the right tools. Auditors and advisers get read-only finance." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map(([name, icon, line, items], i) => (
            <article key={name} className={`flex flex-col gap-4 rounded-3xl border p-6 ${i === 1 ? "border-primary/40 bg-primary-soft/60" : "border-border bg-white"}`}>
              <div className="flex items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${i === 1 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}><Icon name={icon} /></span>
              </div>
              <div>
                <h3 className="text-lg font-semibold">{name}</h3>
                <p className="text-sm text-muted">{line}</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {items.map((t) => <li key={t} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Mobile() {
  return (
    <section id="mobile" className="scroll-mt-20 overflow-hidden bg-ink py-24 text-white">
      <div className={`${container} grid items-center gap-16 lg:grid-cols-2`}>
        <div className="flex flex-col gap-5">
          <span className="text-sm font-semibold text-[#b794ff]">Mobile app</span>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Tapasok in every member&apos;s pocket</h2>
          <p className="text-lg leading-relaxed text-[#c9c2e6]">The Android app is built for event day: open it, scan the code, done. Officers get their tools too, from verifying payments to opening check-in, and can switch between organizations in one tap.</p>
          <ul className="grid gap-3 text-[#e7e2f7] sm:grid-cols-2">
            {["Scan to check in", "Attendance rate and history", "Fees, payments and receipts", "Officer tools by position", "Announcements and alerts", "Same account as the website"].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><Icon name="check" className="h-3.5 w-3.5 text-[#b794ff]" /></span>{t}</li>
            ))}
          </ul>
          <p className="text-sm text-[#a59dc8]">Android app available from your organization. On iPhone, use the website in your browser.</p>
        </div>
        <div className="relative flex justify-center gap-6">
          <div className="absolute inset-0 m-auto h-80 w-80 rounded-full bg-primary/40 blur-3xl" aria-hidden="true" />
          <div className="relative mt-12 hidden sm:block"><PhoneMockup variant="home" /></div>
          <div className="relative"><PhoneMockup /></div>
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items: [IconName, string, string][] = [
    ["settings", "Permissions by position", "Every action is checked on the server against the person's position in that organization. Hiding a button is never the protection."],
    ["clipboard", "A full audit trail", "Sign-ins, payments, corrections and card registrations are logged with who did it and when."],
    ["alert", "Accounts that defend themselves", "Five wrong passwords lock an account for 15 minutes. Sessions can be ended from the server at any time."],
    ["scan", "Privacy by design", "No GPS, ever. Members see only their own records; finance and rosters are limited to the officers who need them."],
  ];
  return (
    <section className="py-24">
      <div className={container}>
        <SectionHead center eyebrow="Trust" title="Serious about the records you keep" text="Attendance and money decide standing and clearance. Tapasok treats them that way." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {items.map(([icon, title, text]) => (
            <div key={title} className="flex gap-4 rounded-3xl border border-border bg-white p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon name={icon} /></span>
              <div className="flex flex-col gap-1"><h3 className="font-semibold">{title}</h3><p className="text-sm leading-relaxed text-muted">{text}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qa: [string, string][] = [
    ["How do I get an account?", "Your administrator creates it, usually by importing the student list. You receive a one-time setup link to choose your password, then sign in with your email."],
    ["I forgot my password. What now?", "Ask your administrator for a new setup link. For security, passwords are never sent by email or shown to anyone."],
    ["Does check-in use my location?", "No. Attendance is verified by the session code, your registration for the event and the time window. Tapasok never reads GPS."],
    ["Can I pay my dues through Tapasok?", "You can record a GCash or bank payment with its reference and proof, or pay cash to your treasurer. Either way it counts once the treasurer confirms it, and you get a receipt code."],
    ["I'm an officer in one organization and a member in another.", "That's normal. You use one account. Pick the organization, and Tapasok shows the tools for your position there while your own records stay the same."],
    ["Is there an iPhone app?", "The app is on Android for now. On iPhone, the website works fully in Safari."],
  ];
  return (
    <section id="faq" className="scroll-mt-20 bg-[#faf9fd] py-24">
      <div className={`${container} grid gap-12 lg:grid-cols-[1fr_1.4fr]`}>
        <SectionHead eyebrow="FAQ" title="Questions, answered" text="Something else? Ask your organization's officers or your administrator." />
        <div className="flex flex-col gap-3">
          {qa.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-border bg-white p-5 open:shadow-card">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                {q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition-transform group-open:rotate-45"><Icon name="plus" className="h-4 w-4" /></span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-24">
      <div className={container}>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#3b1690] via-primary to-[#8b4dff] px-6 py-16 text-center text-white sm:px-16">
          <div className="bg-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
            <LogoMark className="h-12 w-12 drop-shadow-lg" />
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Your next event starts here.</h2>
            <p className="text-lg text-[#e9ddff]">Sign in with the account your administrator gave you.</p>
            <Link href="/login" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-7 text-sm font-semibold text-primary shadow-lg hover:bg-[#f4efff]">Sign in to Tapasok <Arrow /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className={`${container} flex flex-col items-start justify-between gap-6 py-10 sm:flex-row sm:items-center`}>
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-sm text-muted">Student organization management. Events, attendance, dues and announcements.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {NAV.map(([label, href]) => <a key={href} href={href} className="hover:text-foreground">{label}</a>)}
          <Link href="/login" className="font-semibold text-primary">Sign in</Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className={`${container} py-5 text-xs text-muted`}>© {2026} Tapasok. Built for student organizations.</p>
      </div>
    </footer>
  );
}
