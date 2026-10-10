import { redirect } from "next/navigation";

// /dashboard requires a session and redirects to /login when there is none.
export default function Home() {
  redirect("/dashboard");
}
