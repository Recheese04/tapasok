import { redirect } from "next/navigation";

// The CSV import opens in a dialog on the User Management page. This route stays so old links keep working.
export const instant = false;

export default function ImportUsersPage() {
  redirect("/users?import=1");
}
