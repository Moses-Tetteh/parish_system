import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Either Holy Matrimony OR Holy Orders — across the two REGISTERS. A person is identified by the
 * Baptism register entry both records link to (`baptism_register_ref`), which is the one reliable key.
 * Only active (non-archived) records count.
 */
export async function activeMarriageForBaptism(baptismId: number): Promise<number | null> {
  const [row] = await db().select({ id: schema.matrimonyRecords.id })
    .from(schema.spouses)
    .innerJoin(schema.matrimonyRecords, eq(schema.matrimonyRecords.id, schema.spouses.matrimonyId))
    .where(and(eq(schema.spouses.baptismRegisterRef, baptismId), eq(schema.matrimonyRecords.isArchived, 0)))
    .limit(1);
  return row?.id ?? null;
}

export async function activeOrdinationForBaptism(baptismId: number): Promise<number | null> {
  const [row] = await db().select({ id: schema.holyOrders.id }).from(schema.holyOrders)
    .where(and(eq(schema.holyOrders.baptismRegisterRef, baptismId), eq(schema.holyOrders.isArchived, 0)))
    .limit(1);
  return row?.id ?? null;
}

export const ORDERS_BLOCKS_MARRIAGE = "is recorded in the Holy Orders register, so a marriage cannot also be recorded. Holy Matrimony and Holy Orders are either/or.";
export const MARRIAGE_BLOCKS_ORDERS = "is recorded in the Holy Matrimony register, so Holy Orders cannot also be recorded. Holy Matrimony and Holy Orders are either/or.";

/** Used by the generic register save: only the Holy Orders register has the reverse check. */
export async function crossRegisterErrors(defKey: string, values: Record<string, unknown>): Promise<Record<string, string>> {
  if (defKey !== "holy_orders") return {};
  const ref = Number(values.baptism_register_ref);
  if (!Number.isInteger(ref) || ref <= 0) return {};
  const marriage = await activeMarriageForBaptism(ref);
  return marriage ? { baptism_register_ref: `This person ${MARRIAGE_BLOCKS_ORDERS} (Matrimony record #${marriage})` } : {};
}

