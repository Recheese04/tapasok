"use client";

import { secondaryButton } from "@/components/shared/ui";

/** Opens the browser's print dialog (the page hides its menus and filters when printed). */
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className={`${secondaryButton} print:hidden`}>Print</button>;
}
