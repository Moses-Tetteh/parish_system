import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { bannsCheck } from "@/lib/marriage-prep/rules";
import { afterPrepSave } from "@/lib/marriage-prep/service";
import type { Values } from "./validation";

/**
 * Register-specific behaviour that the generic engine cannot know (the PHP app's ParishHooks). Registered by register key:
 *   beforeSave -> may reject the save (HookError) or return advisory warnings; afterSave -> runs once the entry is committed.
 * A failing afterSave never undoes or hides the saved entry: it is logged and the user is told to check.
 */
export class HookError extends Error {}

type Before = (values: Values, id: number | null) => Promise<{ warnings: string[] }> | { warnings: string[] };
type After = (user: SessionUser, id: number) => Promise<string[]>;

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

const BEFORE: Record<string, Before> = {
  marriage_prep: (v) => {
    const r = bannsCheck({ banns1Date: str(v.banns_1_date), banns2Date: str(v.banns_2_date), banns3Date: str(v.banns_3_date) });
    if (r.error) throw new HookError(r.error);
    return { warnings: r.warnings };
  },
};

const AFTER: Record<string, After> = {
  marriage_prep: afterPrepSave,
};

export async function runBeforeSave(key: string, values: Values, id: number | null): Promise<string[]> {
  return (await BEFORE[key]?.(values, id))?.warnings ?? [];
}

export async function runAfterSave(key: string, user: SessionUser, id: number): Promise<string[]> {
  try { return (await AFTER[key]?.(user, id)) ?? []; }
  catch (e) { console.error(JSON.stringify({ level: "error", msg: "after-save hook failed", key, id, err: String(e) })); return ["The entry was saved, but its follow-up update (status / announcements) did not finish — open it and save again."]; }
}
