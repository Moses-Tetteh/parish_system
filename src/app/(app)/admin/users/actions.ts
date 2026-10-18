"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

export interface UserFormState { error?: string; ok?: string }

const createSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9._-]+$/, "Username may contain letters, numbers, . _ - only."),
  fullName: z.string().trim().max(200),
  role: z.enum(ROLES),
  password: z.string().max(200),
});

export async function createUserAction(_p: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await requirePermission("users.manage");
  const parsed = createSchema.safeParse({ username: fd.get("username"), fullName: fd.get("fullName") ?? "", role: fd.get("role"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { username, fullName, role, password } = parsed.data;
  const problems = passwordProblems(password, username);
  if (problems.length) return { error: problems.join(" ") };

  const [dup] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).limit(1);
  if (dup) return { error: "That username is already taken." };

  const hash = await hashPassword(password);
  await db().transaction(async (tx) => {
    const [row] = await tx.insert(schema.users).values({ username, passwordHash: hash, role, fullName: fullName || null }).returning({ id: schema.users.id });
    await logAudit({ table: "users", recordId: row!.id, action: "create", username: admin.username, details: { username, role } }, tx);
  });
  revalidatePath("/admin/users");
  return { ok: `User “${username}” created.` };
}

async function adminCount(excludingId: number): Promise<number> {
  const [r] = await db().select({ n: sql<number>`count(*)` }).from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.isActive, 1), ne(schema.users.id, excludingId)));
  return Number(r?.n ?? 0);
}

export async function toggleUserAction(id: number): Promise<void> {
  const admin = await requirePermission("users.manage");
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) return;
  const deactivating = u.isActive === 1;
  // Guard rails: nobody can lock themselves out, and the system can never be left without an administrator.
  if (deactivating && (u.id === admin.id || (u.role === "admin" && (await adminCount(u.id)) === 0))) return;
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ isActive: deactivating ? 0 : 1 }).where(eq(schema.users.id, id));
    await logAudit({ table: "users", recordId: id, action: "update", username: admin.username, details: { isActive: !deactivating } }, tx);
  });
  revalidatePath("/admin/users");
}

export async function changeRoleAction(id: number, fd: FormData): Promise<void> {
  const admin = await requirePermission("users.manage");
  const role = z.enum(ROLES).safeParse(fd.get("role"));
  if (!role.success) return;
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u || u.role === role.data) return;
  if (u.role === "admin" && ((await adminCount(u.id)) === 0)) return;
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ role: role.data }).where(eq(schema.users.id, id));
    await logAudit({ table: "users", recordId: id, action: "update", username: admin.username, details: { role: role.data } }, tx);
  });
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(id: number, _p: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await requirePermission("users.manage");
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) return { error: "User not found." };
  const pw = String(fd.get("password") ?? "");
  const problems = passwordProblems(pw, u.username);
  if (problems.length) return { error: problems.join(" ") };
  const hash = await hashPassword(pw);
  await db().transaction(async (tx) => {
    await tx.update(schema.users).set({ passwordHash: hash, failedLoginAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, id));
    await logAudit({ table: "users", recordId: id, action: "update", username: admin.username, details: { field: "password reset" } }, tx);
  });
  return { ok: `Password reset for ${u.username}. Their other sessions were signed out.` };
}
