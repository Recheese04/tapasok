import { afterAll, beforeEach, vi } from "vitest";

// Next.js request APIs are not available outside a request, so replace them.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

// Replace the session layer: tests choose who is "signed in" via authState.
// Everything downstream (permissions, actions, services, database) is the real code.
vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const { authState } = await import("./helpers/auth-state");
  return {
    ...(await importOriginal<typeof import("@/lib/auth/dal")>()), // keeps loadUserByToken (used by the mobile API)
    getCurrentUser: async () => authState.user,
    requireUser: async () => {
      if (!authState.user) throw new Error("NEXT_REDIRECT:/login");
      if (authState.user.mustChangePassword) throw new Error("NEXT_REDIRECT:/change-password");
      return authState.user;
    },
    requireUserForPasswordChange: async () => {
      if (!authState.user) throw new Error("NEXT_REDIRECT:/login");
      return authState.user;
    },
    getActiveUser: async () => (authState.user && !authState.user.mustChangePassword ? authState.user : null),
  };
});

const { resetDatabase, disconnect } = await import("./helpers/db");

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});
