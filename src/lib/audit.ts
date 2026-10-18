import "server-only";
import { headers } from "next/headers";
import { db, schema, type Executor } from "@/db";

/** Vercel overwrites X-Forwarded-For with the real client address, so the left-most hop is trustworthy there. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 45);
  } catch {
    return "unknown";
  }
}

const SENSITIVE_KEYS = /pass(word)?|hash|secret|token/i;

/** Strips credential-like keys before anything is written to the audit trail. */
export function redact(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(redact);
  if (data && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v)]),
    );
  }
  return data;
}

export interface AuditEntry {
  table: string;
  recordId: number;
  action: "create" | "update" | "archive" | "restore" | "delete" | "approve" | "reject" | "issue";
  username: string | null;
  details?: unknown;
}

/**
 * Pass the open transaction so the change and its audit row commit (or roll back) TOGETHER:
 * there is never a modification without a trail. Errors propagate on purpose.
 */
export async function logAudit(entry: AuditEntry, executor: Executor = db()): Promise<void> {
  await executor.insert(schema.auditLog).values({
    tableName: entry.table.slice(0, 50),
    recordId: entry.recordId,
    action: entry.action,
    username: entry.username,
    details: entry.details === undefined ? null : JSON.stringify(redact(entry.details)),
  });
}

/** Access log is best-effort: a logging hiccup must never take a page down. */
export async function logAccess(entry: {
  username: string | null;
  role: string | null;
  action: string;
  resource: string;
  recordId?: number | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await db().insert(schema.accessLog).values({
      username: entry.username,
      role: entry.role,
      action: entry.action.slice(0, 20),
      resource: entry.resource.slice(0, 60),
      recordId: entry.recordId ?? null,
      detail: entry.detail ? entry.detail.slice(0, 300) : null,
      ipAddress: await clientIp(),
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "access_log write failed", err: String(e) }));
  }
}
