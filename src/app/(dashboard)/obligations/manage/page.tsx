import { redirect } from "next/navigation";

// Manage Obligations was removed from Tapasok at the owner's request (2026-10-28). Old links and bookmarks land on the dashboard.
// Existing obligation records stay in the database untouched; nothing reads or changes them anymore.
export default function RemovedObligationsPage() {
  redirect("/dashboard");
}
