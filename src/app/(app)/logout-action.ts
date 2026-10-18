"use server";

import { redirect } from "next/navigation";
import { logAccess } from "@/lib/audit";
import { endSession, getCurrentUser } from "@/lib/auth/session";

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await logAccess({ username: user.username, role: user.role, action: "logout", resource: "auth" });
  await endSession();
  redirect("/login");
}
