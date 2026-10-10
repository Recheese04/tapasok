import { redirect } from "next/navigation";

// Redirect-only route kept for old links; nothing to validate.
export const instant = false;

export default function ImportStudentsRedirect() {
  redirect("/users/import");
}
