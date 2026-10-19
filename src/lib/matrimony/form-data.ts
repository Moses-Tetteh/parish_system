import "server-only";
import type { Role } from "@/lib/auth/permissions";
import type { RecordRow } from "@/lib/registers/types";
import { buildFieldViews, recordToFormValues } from "@/lib/registers/view";
import { MARRIAGE_DEF, SPOUSE_DEF } from "./fields";

const prefix = (p: string, m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [p + k, v]));

/** Everything the form needs, for a new record (data = null) or an existing one. */
export async function marriageFormModel(role: Role, data: { marriage: RecordRow; groom: RecordRow | null; bride: RecordRow | null } | null) {
  const [marriageFields, spouseFields, mv, gv, bv] = await Promise.all([
    buildFieldViews(MARRIAGE_DEF, role),
    buildFieldViews(SPOUSE_DEF, role),
    recordToFormValues(MARRIAGE_DEF, data?.marriage ?? null, { marriage_type: "catholic" }),
    recordToFormValues(SPOUSE_DEF, data?.groom ?? null, {}),
    recordToFormValues(SPOUSE_DEF, data?.bride ?? null, {}),
  ]);
  return { marriageFields, spouseFields, initial: { ...mv, ...prefix("groom_", gv), ...prefix("bride_", bv) } };
}
