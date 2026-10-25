import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { TransactionForm } from "@/components/TransactionForm";
import { categoryScope, getTransaction, listCategories } from "@/lib/financials/repository";
import { saveTransactionAction } from "../actions";

export const metadata = { title: "Edit Transaction" };
export const dynamic = "force-dynamic";

export default async function EditTransaction({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("financials.transactions");
  const { id: raw } = await params;
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const id = Number(raw);
  const t = await getTransaction(user, id); // null when missing OR outside this role's category scope
  if (!t) notFound();
  const scope = await categoryScope(user);
  const cats = await listCategories(scope, true);
  if (!cats.some((c) => c.id === t.categoryId)) cats.push(...(await listCategories(scope)).filter((c) => c.id === t.categoryId)); // keep an inactive account selectable on an old entry
  const s = (x: string | null) => x ?? "";
  return (
    <>
      <h1>Edit Transaction</h1>
      <TransactionForm
        isNew={false} categories={cats.map((c) => ({ id: c.id, name: c.name, type: c.type as "income" | "expense" }))}
        action={saveTransactionAction.bind(null, id)}
        initial={{
          _version: s(t.updatedAt), category_id: String(t.categoryId), cost_center_account: s(t.costCenterAccount), transaction_date: t.transactionDate, pv_no: s(t.pvNo),
          payment_method: s(t.paymentMethod), invoice_date: s(t.invoiceDate), description: s(t.description), amount: t.amount.toFixed(2), amount_in_words: s(t.amountInWords),
          approved_by: s(t.approvedBy), prepared_by: s(t.preparedBy), received_by: s(t.receivedBy), received_date: s(t.receivedDate),
        }}
      />
    </>
  );
}
