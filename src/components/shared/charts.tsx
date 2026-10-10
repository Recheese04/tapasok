// Dependency-free SVG charts. Each one has a text alternative (a legend or a list of values) so the numbers
// are never conveyed by colour or shape alone.

export type Segment = { label: string; value: number; color: string };

/** Ring chart with the total in the middle and a legend listing every value. */
export function DonutChart({ segments, centerLabel, centerValue }: { segments: Segment[]; centerLabel: string; centerValue?: string | number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${centerLabel}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="11" />
          {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * c;
            const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="11" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold">{centerValue ?? total}</span>
          <span className="text-[11px] text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-muted">{s.label}</span>
            <span className="font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical bars with the value above each bar and the label below. */
export function BarChart({ data, color = "var(--primary)", label }: { data: { label: string; value: number }[]; color?: string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <svg viewBox="0 0 100 60" className="mx-auto h-56 w-full max-w-2xl" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      {data.map((d, i) => {
        const h = (d.value / max) * 40;
        return (
          <g key={d.label}>
            <rect x={i * w + w * 0.2} y={48 - h} width={w * 0.6} height={Math.max(h, d.value > 0 ? 0.8 : 0)} rx="1.5" fill={color} opacity={d.value > 0 ? 1 : 0.15} />
            <text x={i * w + w / 2} y={46 - h} textAnchor="middle" fontSize="3.4" fill="var(--foreground)">{d.value}</text>
            <text x={i * w + w / 2} y="56" textAnchor="middle" fontSize="3.2" fill="var(--muted)">{d.label}</text>
          </g>
        );
      })}
      <line x1="0" y1="48" x2="100" y2="48" stroke="var(--border)" strokeWidth="0.4" />
    </svg>
  );
}
