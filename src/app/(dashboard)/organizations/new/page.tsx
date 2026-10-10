import { redirect } from "next/navigation";

// Creating an organization happens in a dialog on the Organizations page. This route stays so old links keep working.
export const instant = false;

export default function NewOrganizationPage() {
  redirect("/organizations?new=1");
}
