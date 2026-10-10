import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

// A valid hash of a random value. Compared against when the account does not
// exist so that response time does not reveal which emails are registered.
const DUMMY_HASH = "$2b$12$eHap1sYlb/gD/0WBuX.ub.LMc2Uca6uoEN3tndVn.CF3h5FsNUIEa";

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string | null) {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}
