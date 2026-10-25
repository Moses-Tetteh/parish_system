"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { back, checked, dateOf, intOf, moneyOf, oneOf, optStr, str } from "@/lib/forms";
import type { FormState } from "@/lib/registers/form-model";
import { amountToWords } from "@/lib/financials/words";
import {
  FinanceForbiddenError, FinanceInputError, addCategory, isUniqueViolation, recordDuesPayment, saveBudget, saveMember, saveTransaction,
  setCategoryActive, setCategoryDues, setCategoryOffering, setCategoryTiers, setMemberArchived, setTransactionArchived,
} from "@/lib/financials/repository";

const echo = (fd: FormData): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
};

/** Turns repository errors into a message: forbidden -> /forbidden page, input errors -> shown to the user. */
function handle(e: unknown, fallback: string): string {
  if (e instanceof FinanceForbiddenError) redirect("/forbidden");
  if (e instanceof FinanceInputError) return e.message;
  console.error("financials action failed", e);
  return fallback;
}

/* ---------------------------------------------------------------- transactions */

export async function saveTransactionAction(id: number | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const errors: Record<string, string> = {};
  const categoryId = intOf(fd, "category_id");
  const date = dateOf(fd, "transaction_date");
  const amount = moneyOf(fd, "amount");
  if (!categoryId) errors.category_id = "Choose a General Ledger Account.";
  if (!date) errors.transaction_date = "Enter a valid date.";
  if (amount === null) errors.amount = "Enter a valid amount (digits, up to 2 decimals).";
  const method = str(fd, "payment_method", 10);
  for (const k of ["invoice_date", "received_date"]) if (str(fd, k, 10) && !dateOf(fd, k)) errors[k] = "Enter a valid date.";
  if (Object.keys(errors).length) return { errors, values: echo(fd), message: "Please fix the highlighted fields." };

  try {
    const result = await saveTransaction(user, id, {
      categoryId: categoryId!, costCenterAccount: optStr(fd, "cost_center_account", 150), transactionDate: date!, pvNo: optStr(fd, "pv_no", 50),
      paymentMethod: method === "cash" || method === "cheque" ? method : null, invoiceDate: dateOf(fd, "invoice_date"), amount: amount!,
      amountInWords: optStr(fd, "amount_in_words") ?? amountToWords(amount!), description: optStr(fd, "description"),
      approvedBy: optStr(fd, "approved_by", 150), preparedBy: optStr(fd, "prepared_by", 150), receivedBy: optStr(fd, "received_by", 150), receivedDate: dateOf(fd, "received_date"),
    }, id !== null && fd.has("_version") ? str(fd, "_version", 40) : undefined);
    if (result === "conflict") return { values: echo(fd), message: "Someone else saved this transaction while you were editing it (or it was removed). Reload to see their changes, then re-apply yours." };
  } catch (e) {
    return { values: echo(fd), message: handle(e, "Could not save the transaction. Nothing was lost — please try again.") };
  }
  redirect(`/financials?ok=${encodeURIComponent(id ? "Transaction updated." : "Transaction recorded.")}`);
}

export async function archiveTransactionAction(id: number, archived: boolean): Promise<void> {
  const user = await requireUser();
  try { await setTransactionArchived(user, id, archived); } catch (e) { back("/financials", "error", handle(e, "Could not update the transaction.")); }
  back(archived ? "/financials" : "/financials?archived=1", "ok", archived ? "Transaction archived." : "Transaction restored.");
}

/* ---------------------------------------------------------------- categories */

const CAT = "/financials/categories";

export async function addCategoryAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const name = str(fd, "name", 150), type = oneOf(fd, "type", ["income", "expense"] as const);
  if (!name || !type) back(CAT, "error", "Please provide a category name and a valid type.");
  try { await addCategory(user, name, type!); } catch (e) { back(CAT, "error", isUniqueViolation(e) ? "That category already exists for this type." : handle(e, "Could not add the category.")); }
  back(CAT, "ok", "Category added.");
}

export async function toggleCategoryAction(id: number, active: boolean): Promise<void> {
  const user = await requireUser();
  try { await setCategoryActive(user, id, active); } catch (e) { back(CAT, "error", handle(e, "Could not update the category.")); }
  back(CAT, "ok", active ? "Category activated." : "Category deactivated.");
}

export async function offeringAction(id: number, fd: FormData): Promise<void> {
  const user = await requireUser();
  const on = checked(fd, "is_offering_category");
  try { await setCategoryOffering(user, id, on); } catch (e) { back(CAT, "error", handle(e, "Could not update the category.")); }
  back(CAT, "ok", on ? "Category marked as an offering category." : "Category offering flag cleared.");
}

export async function duesConfigAction(id: number, fd: FormData): Promise<void> {
  const user = await requireUser();
  const on = checked(fd, "is_dues_category"), amount = moneyOf(fd, "annual_dues_amount");
  if (on && (amount === null || amount <= 0)) back(CAT, "error", "Please provide a positive annual amount for a dues category.");
  try { await setCategoryDues(user, id, on, amount); } catch (e) { back(CAT, "error", handle(e, "Could not update the category.")); }
  back(CAT, "ok", on ? "Category marked as a dues category." : "Category dues settings cleared.");
}

export async function tierConfigAction(id: number, fd: FormData): Promise<void> {
  const user = await requireUser();
  const on = checked(fd, "is_tiered");
  const child = moneyOf(fd, "tier_child_amount"), youth = moneyOf(fd, "tier_youth_amount"), adult = moneyOf(fd, "tier_adult_amount");
  if (on && (child === null || youth === null || adult === null)) back(CAT, "error", "Please provide a Child, Youth, and Adult amount (0 or more) for age-tiered dues.");
  try { await setCategoryTiers(user, id, on, child, youth, adult); } catch (e) { back(CAT, "error", handle(e, "Could not update the category.")); }
  back(CAT, "ok", on ? "Age-tiered dues amounts saved." : "Age-tiered pricing turned off for this category.");
}

/* ---------------------------------------------------------------- members + dues */

const MEMBERS = "/financials/members";

export async function saveMemberAction(id: number | null, fd: FormData): Promise<void> {
  const user = await requireUser();
  const fullName = str(fd, "full_name", 200);
  if (!fullName) back(MEMBERS, "error", "Please provide the member’s full name.");
  const since = intOf(fd, "member_since");
  if (since !== null && (since < 1900 || since > 2200)) back(MEMBERS, "error", "Member-since must be a valid year.");
  try {
    await saveMember(user, id, {
      fullName, household: optStr(fd, "household", 200), memberTier: oneOf(fd, "member_tier", ["child", "youth", "adult"] as const) ?? "adult",
      contact: optStr(fd, "contact", 150), memberSince: since, notes: optStr(fd, "notes", 2000),
    });
  } catch (e) { back(MEMBERS, "error", handle(e, "Could not save the member. Please try again.")); }
  back(MEMBERS, "ok", id ? "Member updated." : "Member added.");
}

export async function archiveMemberAction(id: number, archived: boolean): Promise<void> {
  const user = await requireUser();
  try { await setMemberArchived(user, id, archived); } catch (e) { back(MEMBERS, "error", handle(e, "Could not update the member.")); }
  back(archived ? MEMBERS : `${MEMBERS}?archived=1`, "ok", archived ? "Member archived." : "Member restored.");
}

export async function recordDuesAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const memberId = intOf(fd, "member_id"), categoryId = intOf(fd, "category_id"), year = intOf(fd, "fiscal_year");
  const amount = moneyOf(fd, "amount"), date = dateOf(fd, "payment_date");
  const here = `/financials/dues?category_id=${categoryId ?? ""}&fiscal_year=${year ?? ""}`;
  if (!memberId || !categoryId || !year || amount === null || amount <= 0 || !date) back(here, "error", "Please choose a member, dues category, fiscal year, a valid amount, and a date.");
  try { await recordDuesPayment(user, { memberId: memberId!, categoryId: categoryId!, fiscalYear: year!, amount: amount!, date: date!, notes: optStr(fd, "notes", 1000) }); }
  catch (e) { back(here, "error", handle(e, "Could not record the payment. Please try again.")); }
  back(here, "ok", "Dues payment recorded.");
}

/* ---------------------------------------------------------------- budgets */

export async function saveBudgetAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const year = intOf(fd, "fiscal_year");
  if (!year || year < 2000 || year > 2200) back("/financials/budget", "error", "Choose a valid fiscal year.");
  const ids = fd.getAll("category_id"), amounts = fd.getAll("amount");
  const map = new Map<number, number>();
  ids.forEach((raw, i) => {
    const id = Number(raw), amt = Number(String(amounts[i] ?? "0").replace(/,/g, ""));
    if (Number.isInteger(id) && id > 0 && Number.isFinite(amt) && amt >= 0) map.set(id, Math.round(amt * 100) / 100);
  });
  try { await saveBudget(user, year!, map); } catch (e) { back("/financials/budget", "error", handle(e, "Could not save the budget.")); }
  back(`/financials/budget?year=${year}`, "ok", `Budget for ${year} saved.`);
}
