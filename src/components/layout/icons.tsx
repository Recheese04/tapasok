import type { ReactNode } from "react";

// Small outline icons (24px grid, 1.8 stroke). Decorative: every use sits next to a text label.
const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" />,
  users: <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm10 8v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.8a3.2 3.2 0 0 1 0 6.2" />,
  academic: <path d="m3 9 9-4.5L21 9l-9 4.5L3 9Zm4 2.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5" />,
  building: <path d="M4 20V5.5L12 3l8 2.5V20M2.5 20h19M9 8.5h1.5M13.5 8.5H15M9 12h1.5M13.5 12H15M10.5 20v-4h3v4" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m5 7H3" />,
  calendar: <path d="M7 3v3m10-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" />,
  clipboard: <path d="M9 4h6v2.5H9V4Zm-2 1.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 18 5.5h-1M8.5 12h7m-7 3.5h5" />,
  scan: <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8m8 0h2.5A1.5 1.5 0 0 1 20 5.5V8m0 8v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16" />,
  check: <path d="M5 12.5 10 17.5 19.5 7" />,
  task: <path d="M9 6h11M9 12h11M9 18h11M4 6l1.2 1.2L7 5.4M4 12l1.2 1.2L7 11.4M4 18l1.2 1.2L7 17.4" />,
  alert: <path d="M12 4 21 19.5H3L12 4Zm0 5.5v4.5m0 2.5v.01" />,
  wallet: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13.5a.5.5 0 0 0 .5-.5V8.5a.5.5 0 0 0-.5-.5H6.5A2.5 2.5 0 0 1 4 7.5Zm12.5 5h2" />,
  megaphone: <path d="M4 10v4a1 1 0 0 0 1 1h2.5l7 4V5l-7 4H5a1 1 0 0 0-1 1Zm13.5-.5a3.5 3.5 0 0 1 0 5" />,
  file: <path d="M7 3.5h6.5L19 9v11a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 7 20V3.5Zm6 0V9h6M9.5 13h6m-6 3.5h6" />,
  star: <path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7L12 4Z" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5.9.7-1.5 2.6-1.1-.4a7 7 0 0 1-1.5.9l-.2 1.2h-3l-.2-1.2a7 7 0 0 1-1.5-.9l-1.1.4L7.7 13l.9-.7a7 7 0 0 1 0-1.8l-.9-.7 1.5-2.6 1.1.4a7 7 0 0 1 1.5-.9l.2-1.2h3l.2 1.2a7 7 0 0 1 1.5.9l1.1-.4 1.5 2.6-.9.7a7 7 0 0 1 0 1.8Z" />,
  userPlus: <path d="M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 17.5V19M9.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19 8v6m3-3h-6" />,
  logout: <path d="M10 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h4M15 8l4 4-4 4m4-4H9" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cap: <path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
