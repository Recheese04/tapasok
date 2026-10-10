export const ACCOUNT_TYPES = ["STUDENT", "STAFF", "ACCOUNT_ONLY"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { STUDENT: "Student", STAFF: "Faculty / staff", ACCOUNT_ONLY: "Account only" };
