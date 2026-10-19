import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Executor } from "@/db";
import { logAudit } from "@/lib/audit";

const stamp = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: process.env.TZ || "Africa/Accra", day: "2-digit", month: "short", year: "numeric" }).format(new Date());

/**
 * Marginal notation (Canon 535 §2): when a person is married (or confirmed / ordained) the parish
 * baptismal register is annotated. Appends a dated line to the Baptism record's `marginal_notes`
 * (never to the secretary's own `notes`), unless the exact note is already there, so re-saving a
 * record never piles up duplicates. Runs inside the caller's transaction and is audited.
 */
export async function addBaptismMarginalNote(tx: Executor, baptismId: number | null | undefined, note: string, username: string): Promise<void> {
  if (!baptismId || !note) return;
  const [row] = await tx.select({ id: schema.baptismRecords.id, marginal: schema.baptismRecords.marginalNotes })
    .from(schema.baptismRecords).where(eq(schema.baptismRecords.id, baptismId)).limit(1);
  if (!row) return;
  const existing = row.marginal ?? "";
  if (existing.includes(note)) return;
  const line = `[${stamp()}] ${note}`;
  await tx.update(schema.baptismRecords).set({ marginalNotes: existing ? `${existing}\n${line}` : line, updatedBy: username })
    .where(eq(schema.baptismRecords.id, baptismId));
  await logAudit({ table: "baptism_records", recordId: baptismId, action: "update", username, details: { marginal_note: note } }, tx);
}
