// The CSV import contract, in one place that the server importer AND the import screen both read, so the rules shown to the
// person, the checks done in the browser and the checks done on the server cannot drift apart. No server-only code here.

export type ColumnNeed = "required" | "conditional" | "optional";
export type ImportColumn = { name: string; need: ColumnNeed; note: string; student: string; staff: string };

export const IMPORT_SPEC: ImportColumn[] = [
  { name: "first_name", need: "required", note: "Given name.", student: "Maria", staff: "Ben" },
  { name: "last_name", need: "required", note: "Family name.", student: "Santos", staff: "Reyes" },
  { name: "email", need: "required", note: "Must be unique across all accounts.", student: "maria.santos@example.test", staff: "ben.reyes@example.test" },
  { name: "account_type", need: "optional", note: "STUDENT (default) or STAFF. Administrators cannot be imported.", student: "STUDENT", staff: "STAFF" },
  { name: "student_number", need: "conditional", note: "Required for students (3-20 letters, digits or dashes). Unique.", student: "2026-0001", staff: "" },
  { name: "employee_id", need: "conditional", note: "Required for STAFF. Unique.", student: "", staff: "EMP-001" },
  { name: "middle_name", need: "optional", note: "", student: "Cruz", staff: "" },
  { name: "contact_number", need: "optional", note: "Philippine mobile number, for example 09171234567.", student: "09171234567", staff: "09181234567" },
  { name: "program_code", need: "optional", note: "Students: the code of an active program (see the list below).", student: "CS-P1", staff: "" },
  { name: "year_level", need: "optional", note: "Students: a whole number from 1 to 10.", student: "1", staff: "" },
  { name: "rfid_uid", need: "optional", note: "Students: 4-20 hexadecimal characters. Unique.", student: "04A1B2C3", staff: "" },
  { name: "street_address", need: "optional", note: "Students: house number and street.", student: "12 Rizal St", staff: "" },
  { name: "region_code", need: "optional", note: "Students: PSGC codes. If you give any address code, give region, city and barangay (province too where the region has provinces).", student: "", staff: "" },
  { name: "province_code", need: "optional", note: "", student: "", staff: "" },
  { name: "city_code", need: "optional", note: "", student: "", staff: "" },
  { name: "barangay_code", need: "optional", note: "", student: "", staff: "" },
  { name: "college_code", need: "optional", note: "Staff: the code of an active college.", student: "", staff: "CS" },
  { name: "department_code", need: "optional", note: "Staff: the code of an active department of that college (needs college_code).", student: "", staff: "GEN" },
  { name: "job_title", need: "optional", note: "Staff: for example Instructor.", student: "", staff: "Instructor" },
];

export const REQUIRED_COLUMNS = IMPORT_SPEC.filter((c) => c.need === "required").map((c) => c.name);
export const KNOWN_COLUMNS = new Set(IMPORT_SPEC.map((c) => c.name));

/** Maps the form-field names used in validation messages to the CSV column a person has to fix. */
export const FIELD_TO_COLUMN: Record<string, string> = {
  firstName: "first_name", lastName: "last_name", middleName: "middle_name", email: "email", studentNumber: "student_number", employeeId: "employee_id",
  contactNumber: "contact_number", programId: "program_code", yearLevel: "year_level", rfidUid: "rfid_uid", streetAddress: "street_address",
  collegeId: "college_code", departmentId: "department_code", jobTitle: "job_title",
  regionCode: "region_code", provinceCode: "province_code", cityCode: "city_code", barangayCode: "barangay_code",
};

/** "studentNumber: Student number must be…" becomes "student_number: Student number must be…". */
export function csvMessage(message: string): string {
  return message.replace(/(^|; )([a-zA-Z]+): /g, (m, pre: string, field: string) => `${pre}${FIELD_TO_COLUMN[field] ?? field}: `);
}

/** Header problems that stop the whole file. Used by the screen before uploading and by the server before importing. */
export function checkImportHeader(rawHeader: string[]): string[] {
  const header = rawHeader.map((h) => h.trim().toLowerCase());
  const problems: string[] = [];
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) problems.push(`Missing required column(s): ${missing.join(", ")}.`);
  if (!header.includes("student_number") && !header.includes("employee_id")) problems.push("Include a student_number column (students) and/or an employee_id column (faculty/staff).");
  const dup = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (dup.length) problems.push(`Duplicate column(s): ${[...new Set(dup)].join(", ")}.`);
  return problems;
}

export function ignoredColumns(rawHeader: string[]): string[] {
  return rawHeader.map((h) => h.trim().toLowerCase()).filter((h) => h && !KNOWN_COLUMNS.has(h));
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The downloadable template: every column, one example student row and one example staff row. */
export function templateCsv(): string {
  const cols = IMPORT_SPEC;
  const lines = [cols.map((c) => c.name).join(","), cols.map((c) => csvCell(c.student)).join(","), cols.map((c) => csvCell(c.staff)).join(",")];
  return lines.join("\r\n") + "\r\n";
}
