"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { requireUser, startSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";

export interface PwState { error?: string; ok?: boolean }

const input = z.object({ current: z.string().min(1).max(200), next: z.string().max(200), confirm: z.string().max(200) });

export async function changePasswordAction(_p: PwState, fd: FormData): Promise<PwState> {
  const user = await requireUser();
  if (!(await rateLimit(`pw:${user.id}`, 8, 15 * 60_000)).ok) return { error: "Too many attempts. Please wait and try again." };
  const parsed = input.safeParse({ current: fd.get("current"), next: fd.get("next"), confirm: fd.get("confirm") });
  if (!parsed.success) return { error: "Please fill in all fields." };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { error: "The new passwords do not match." };
  const problems = passwordProblems(next, user.username);
  if (problems.length) return { error: problems.join(" ") };

  const [row] = await db().select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "Your current password is not correct." };

  const hash = await hashPassword(next);
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ passwordHash: hash }).where(eq(schema.users.id, user.id));
    await logAudit({ table: "users", recordId: user.id, action: "update", username: user.username, details: { field: "password" } }, tx);
  });
  await startSession({ id: user.id, passwordHash: hash }); // other sessions die (fingerprint changed); this one continues
  return { ok: true };
}
