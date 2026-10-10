import { redirect } from "next/navigation";

// Joining now lives on My Organizations. This route stays so old links, bookmarks and post-login redirects still work.
// Redirect-only route kept for old links; nothing to validate.
export const instant = false;

export default function JoinRedirect() {
  redirect("/organizations");
}
