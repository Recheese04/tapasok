import { Page, PageHeader } from "@/components/shared/ui";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { ImportForm } from "@/features/students/student-forms";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function ImportUsersPage() {
  await requireSystemPermissionPage("users.manage");
  return (
    <Page>
      <PageHeader
        title="Import accounts"
        subtitle="Upload a CSV of students and/or faculty/staff. Required: first_name, last_name, email, plus student_number (students) or employee_id (staff, with account_type STAFF). Optional: middle_name, program_code, year_level, rfid_uid, contact_number, street_address, college_code, department_code, job_title and PSGC address codes. Imports never create administrators or assign positions."
      />
      <ImportForm />
    </Page>
  );
}
