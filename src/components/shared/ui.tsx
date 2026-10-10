import Link from "next/link";

// Shared building blocks. Every page uses these, so the look (light surfaces, purple accent, soft shadows) is defined here.

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted/70 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60";
export const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary/40 hover:bg-sidebar disabled:opacity-60";
export const dangerButton =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-danger/40 bg-danger/5 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60";
/** Compact bordered buttons for table rows and cards, so every row action looks the same. */
export const actionButton =
  "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-50";
export const actionDanger =
  "inline-flex items-center justify-center rounded-lg border border-danger/30 bg-surface px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50";
/** Compact text-style actions used inside table rows. */
export const rowAction = "text-sm font-medium text-primary hover:underline";
export const rowDanger = "text-sm font-medium text-danger hover:underline";

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link href={href} className={variant === "primary" ? primaryButton : secondaryButton}>
      {children}
    </Link>
  );
}

/** Same look as ButtonLink but jumps to a form further down the same page (the page's own create/edit form). */
export function AnchorButton({ target, children, variant = "primary" }: { target: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <a href={`#${target}`} className={variant === "primary" ? primaryButton : secondaryButton}>
      {children}
    </a>
  );
}

export function Card({ title, children, className = "", action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-5 shadow-card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Dashboard summary tile: an icon chip, a figure and a label. Becomes a link when `href` is given. */
export function StatCard({ label, value, hint, href, icon, tone = "purple" }: { label: string; value: string | number; hint?: string; href?: string; icon?: React.ReactNode; tone?: "purple" | "green" | "amber" | "red" | "blue" }) {
  const chip = { purple: "bg-primary-soft text-primary", green: "bg-success/10 text-success", amber: "bg-warning/10 text-warning", red: "bg-danger/10 text-danger", blue: "bg-sky-100 text-sky-700" }[tone];
  const body = (
    <div className="flex items-center gap-4">
      {icon && <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${chip}`} aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p className="truncate text-sm text-muted">{label}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
  const cls = "rounded-2xl border border-border bg-surface p-4 shadow-card";
  return href ? <Link href={href} className={`${cls} hover:border-primary/40 hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "success" | "info"; children: React.ReactNode }) {
  const color = kind === "error" ? "border-danger/30 bg-danger/5 text-danger" : kind === "success" ? "border-success/30 bg-success/5 text-success" : "border-border bg-sidebar text-muted";
  return (
    <p role={kind === "error" ? "alert" : "status"} data-notice={kind} className={`rounded-xl border px-3 py-2 text-sm ${color}`}>
      {children}
    </p>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-success/10 text-success",
  amber: "bg-warning/10 text-warning",
  red: "bg-danger/10 text-danger",
  gray: "bg-foreground/5 text-muted",
  purple: "bg-primary-soft text-primary",
};

/** Status text is always shown, never color alone. */
export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:hover]:bg-primary-soft/30 [&>tr:last-child>td]:border-b-0">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <td className={`border-b border-border px-4 py-3 align-top ${className}`}>{children}</td>
);
