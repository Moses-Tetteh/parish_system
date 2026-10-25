import { requirePermission } from "@/lib/auth/session";
import { TransactionForm } from "@/components/TransactionForm";
import { categoryScope, listCategories, suggestNextPvNo } from "@/lib/financials/repository";
import { getSetting } from "@/lib/app-settings";
import { todayIso } from "@/lib/dates";
import { saveTransactionAction } from "../actions";

export const metadata = { title: "Add Transaction" };
export const dynamic = "force-dynamic";

export default async function NewTransaction() {
  const user = await requirePermission("financials.transactions");
  const scope = await categoryScope(user);
  const cats = await listCategories(scope, true);
  const today = todayIso();
  return (
    <>
      <h1>Add Transaction</h1>
      <p className="hint">Fields mirror the parish’s payment/receipt ledger. Description, Amount, and Amount in Words are the ones filled in for every entry — the rest are filled in whenever they apply.</p>
      <TransactionForm
        isNew categories={cats.map((c) => ({ id: c.id, name: c.name, type: c.type as "income" | "expense" }))}
        action={saveTransactionAction.bind(null, null)}
        initial={{ transaction_date: today, pv_no: await suggestNextPvNo(today.slice(0, 4)), cost_center_account: await getSetting("parish_name", "Blessed Clementina Parish"), prepared_by: user.fullName ?? user.username }}
      />
    </>
  );
}
