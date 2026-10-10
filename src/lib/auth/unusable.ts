import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/** A bcrypt hash of random bytes nobody ever sees. Invited accounts have no usable password until account setup. */
export const makeUnusableHash = () => bcrypt.hash(randomBytes(32).toString("hex"), 10);
