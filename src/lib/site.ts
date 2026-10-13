// The public address of the site, for search engines and link previews. APP_URL is set per environment (Vercel); the
// fallback is the current production address.
export const SITE_URL = (process.env.APP_URL || "https://tapasok-beta.vercel.app").replace(/\/$/, "");

/** Signed-in areas. Search engines are asked not to crawl them; they also carry a noindex tag. */
export const PRIVATE_PATHS = [
  "/dashboard", "/users", "/students", "/academic", "/organizations", "/events", "/attendance", "/check-in", "/fees",
  "/obligations", "/consequences", "/evaluations", "/announcements", "/documents", "/notifications", "/reports",
  "/settings", "/join", "/activate", "/api/",
];
