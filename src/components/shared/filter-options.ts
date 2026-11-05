// Choices shared by the list filters, so every page words them the same way. A plain module (not "use client"), so both
// server pages and the client filter bar can import the values.
export const YEAR_LEVEL_OPTIONS: [string, string][] = [["1", "Year 1"], ["2", "Year 2"], ["3", "Year 3"], ["4", "Year 4"], ["5", "Year 5"], ["6", "Year 6"], ["none", "No year level"]];
export const ACCOUNT_STATUS_OPTIONS: [string, string][] = [["ACTIVE", "Active"], ["INVITED", "Not set up yet"], ["DISABLED", "Disabled"]];

/** "1"-"6" -> number, "none" -> "none", anything else -> undefined. */
export const parseYearLevel = (v: string | undefined): number | "none" | undefined => (v === "none" ? "none" : /^[1-6]$/.test(v ?? "") ? Number(v) : undefined);
