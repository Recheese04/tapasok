/** Read-only star rating. The number is always available as text for screen readers (never shown by color alone). */
export function Stars({ value, size = "h-4 w-4", label }: { value: number; size?: string; label?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? 1 : rounded >= i - 0.5 ? 0.5 : 0;
        return (
          <svg key={i} viewBox="0 0 20 20" className={size} aria-hidden="true">
            <defs>
              <linearGradient id={`star-${i}-${fill}`}>
                <stop offset={`${fill * 100}%`} stopColor="#f5a524" />
                <stop offset={`${fill * 100}%`} stopColor="#e4e0ee" />
              </linearGradient>
            </defs>
            <path fill={`url(#star-${i}-${fill})`} d="M10 1.6l2.47 5.3 5.8.68-4.28 3.98 1.13 5.74L10 14.43 4.88 17.3l1.13-5.74L1.73 7.58l5.8-.68z" />
          </svg>
        );
      })}
    </span>
  );
}
