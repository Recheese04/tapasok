import type { AuthUser } from "@/lib/auth/dal";

// The signed-in user the mocked session layer returns. null = signed out.
export const authState: { user: AuthUser | null } = { user: null };
