import type { AssessmentKind } from "@/generated/prisma/enums";

// User-facing names for the kinds of fee (the database enum keeps its original values). "Assessment" in the database means
// "a fee charged to a member"; the interface says "fee" so it is never confused with event evaluations.
export const FEE_KIND: Record<AssessmentKind, string> = {
  DUES: "Membership fee",
  SEMESTER_FEE: "Semester fee",
  EVENT_CONTRIBUTION: "Event contribution",
  SPECIAL: "Special fee",
  FINE: "Fine",
  OTHER: "Other fee",
};

/** Kinds a treasurer can create (fines come only from consequences). */
export const CREATABLE_KINDS = ["DUES", "SEMESTER_FEE", "EVENT_CONTRIBUTION", "SPECIAL", "OTHER"] as const satisfies readonly AssessmentKind[];
