import "server-only";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const COST = 12;
// Pre-computed hash used to burn the same CPU time when the username does not exist,
// so response timing never reveals which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);

/** PHP's password_hash() emits "$2y$"; bcryptjs understands the identical "$2a$" form. */
function normalise(hash: string): string {
  return hash.startsWith("$2y$") ? "$2a$" + hash.slice(4) : hash;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(plain, normalise(hash ?? DUMMY_HASH)).then((ok) => ok && !!hash);
}

/** Fingerprint embedded in the session token; rotates whenever the password changes. */
export function passwordFingerprint(hash: string): string {
  return createHash("sha256").update(hash).digest("hex").slice(0, 16);
}

const COMMON = new Set(["password", "password1", "password123", "admin123", "admin1234", "qwerty123", "letmein123", "welcome123", "parish123", "church123", "1234567890"]);

/** Policy for NEW passwords (the legacy default "admin123" must not pass). */
export function passwordProblems(pw: string, username?: string): string[] {
  const problems: string[] = [];
  if (pw.length < 10) problems.push("Use at least 10 characters.");
  if (pw.length > 128) problems.push("Use at most 128 characters.");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) problems.push("Mix upper-case, lower-case letters and a number.");
  if (username && pw.toLowerCase().includes(username.toLowerCase())) problems.push("Do not include your username.");
  if (COMMON.has(pw.toLowerCase().replace(/[^a-z0-9]/g, ""))) problems.push("That password is too common.");
  return problems;
}
