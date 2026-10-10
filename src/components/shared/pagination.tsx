import Link from "next/link";

export const PAGE_SIZE = 25;

export function parsePage(value: string | string[] | undefined) {
  const n = Number(typeof value === "string" ? value : 1);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Previous/next links that keep the other query parameters (search, filters). */
export function Pagination({ page, total, basePath, params = {} }: { page: number; total: number; basePath: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const link = "rounded-lg border border-border bg-surface px-3 py-1 text-sm hover:bg-sidebar";
  return (
    <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
      {page > 1 && <Link className={link} href={href(page - 1)}>Previous</Link>}
      <span className="text-muted">Page {page} of {pages} ({total} total)</span>
      {page < pages && <Link className={link} href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
