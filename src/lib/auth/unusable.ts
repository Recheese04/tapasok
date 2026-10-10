import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/** A bcrypt hash of random bytes nobody ever sees. Invited accounts have no usable password until account setup. */
export const makeUnusableHash = () => bcrypt.hash(randomBytes(32).toString("hex"), 10);

/**
 * How a brand-new account starts out.
 *  - Default (secure): no usable password; the account is INVITED and its owner chooses one through a one-time setup link.
 *  - If the environment variable DEFAULT_ACCOUNT_PASSWORD is set (intended for test installations only), new accounts are
 *    ACTIVE with that shared password and can sign in straight away. Remove the variable to return to setup links.
 */
export type NewCredential = { hash: string; active: boolean; initialPassword: string | null };

export const configuredDefaultPassword = () => process.env.DEFAULT_ACCOUNT_PASSWORD?.trim() || null;

export async function newAccountCredential(): Promise<NewCredential> {
  const initialPassword = configuredDefaultPassword();
  if (initialPassword) return { hash: await bcrypt.hash(initialPassword, 12), active: true, initialPassword };
  return { hash: await makeUnusableHash(), active: false, initialPassword: null };
}
