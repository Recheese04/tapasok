"use client";

import { useEffect } from "react";

/**
 * Browsers can restore a page from their back/forward cache without asking the server. On signed-in pages that could
 * show someone's data after they signed out on a shared computer, so a restored page reloads itself; the server then
 * checks the session and sends a signed-out visitor to the sign-in page.
 */
export function BackForwardGuard() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}
