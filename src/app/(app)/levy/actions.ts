"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { back, dateOf, intOf, moneyOf, optStr } from "@/lib/forms";
import { LevyError, LevyForbiddenError, deleteRemittance, recordRemittance, saveLevyCategories } from "@/lib/levy/service";

const yearOf = (fd: FormData) => { const y = intOf(fd, "year"); return y && y >= 2000 && y <= 2100 ? y : new Date().getUTCFullYear(); };
function msg(e: unknown, fallback: string): string {
  if (e instanceof LevyForbiddenError) redirect("/forbidden");
  if (e instanceof LevyError) return e.message;
  console.error("levy action failed", e);
  return fallback;
}

export async function remitAction(fd: FormData): Promise<void> {
  const user = await requireUser(), year = yearOf(fd), here = `/levy?year=${year}`;
  const amount = moneyOf(fd, "amount"), date = dateOf(fd, "remitted_on"), cat = intOf(fd, "category_id");
  if (amount === null || amount <= 0) back(here, "error", "Enter an amount greater than zero.");
  if (!date) back(here, "error", "Enter the date paid.");
  if (!cat) back(here, "error", "Choose a category flagged for remittance.");
  try { await recordRemittance(user, { categoryId: cat!, year, amount: amount!, date: date!, reference: optStr(fd, "reference_no", 150), notes: optStr(fd, "notes", 500) }); }
  catch (e) { back(here, "error", msg(e, "Could not record the payment.")); }
  back(here, "ok", `Payment of GHS ${amount!.toFixed(2)} recorded.`);
}

export async function deleteRemittanceAction(year: number, id: number): Promise<void> {
  const user = await requireUser();
  try { await deleteRemittance(user, id); } catch (e) { back(`/levy?year=${year}`, "error", msg(e, "Could not delete the payment.")); }
  back(`/levy?year=${year}`, "ok", "Payment record deleted.");
}

export async function levyCategoriesAction(fd: FormData): Promise<void> {
  const user = await requireUser(), year = yearOf(fd), here = `/levy?year=${year}`;
  const flagged = new Set(fd.getAll("remit").map(Number).filter((n) => Number.isInteger(n)));
  const percents = new Map<number, string>();
  for (const [k, v] of fd.entries()) { const m = /^percent_(\d+)$/.exec(k); if (m && typeof v === "string") percents.set(Number(m[1]), v); }
  try { await saveLevyCategories(user, { flagged, percents }); } catch (e) { back(here, "error", msg(e, "Could not update the categories.")); }
  back(here, "ok", "Categories updated.");
}
