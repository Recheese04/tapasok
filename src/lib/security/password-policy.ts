import { configuredDefaultPassword } from "@/lib/auth/unusable";

// Rules on top of the 10-character minimum: refuse passwords that are guessable from what an attacker already knows.

const COMMON = [
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "1234567890", "0123456789", "12345678910", "123456789a", "qwertyuiop", "qwerty1234", "qwerty12345", "1q2w3e4r5t",
  "iloveyou12", "abcdefghij", "abc1234567", "welcome123", "letmein123", "admin12345", "administrator",
  "tapasok123", "tapasok2026", "tapasokadmin", "bisu123456", "bisu2026", "student123", "changeme123",
];

/** A reason the password is too weak, or null when it is acceptable. */
export function weakPasswordReason(password: string, current: string | null, email: string): string | null {
  const p = password.toLowerCase();
  if (current !== null && password === current) return "Choose a password different from your current one.";
  const shared = configuredDefaultPassword();
  if (shared && p.includes(shared.toLowerCase())) return "Don't use the shared starting password. Choose your own.";
  if (COMMON.includes(p) || /^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|9876543210)/.test(password)) return "That password is too common. Choose something harder to guess.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && p.includes(local)) return "Don't include your email address in your password.";
  return null;
}
