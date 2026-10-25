import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { requirePermission } from "@/lib/auth/session";
import { getTransaction } from "@/lib/financials/repository";
import { amountToWords } from "@/lib/financials/words";
import { fmtMoney } from "@/lib/financials/money";
import { formatDate } from "@/lib/dates";
import { getSetting } from "@/lib/app-settings";

export const metadata = { title: "Voucher" };
export const dynamic = "force-dynamic";

export default async function Voucher({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("financials.transactions");
  const { id: raw } = await params;
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const t = await getTransaction(user, Number(raw)); // null if outside this role's scope
  if (!t) notFound();
  const parish = await getSetting("parish_name", "Blessed Clementina Parish");
  const income = t.categoryType === "income";
  const Row = ({ k, v }: { k: string; v: string }) => <tr><th scope="row" style={{ width: 220 }}>{k}</th><td>{v}</td></tr>;

  return (
    <>
      <h1 className="no-print">{income ? "Receipt" : "Payment"} Voucher</h1>
      <div className="card no-print">
        <Link href="/financials" className="btn btn-secondary">← Back to Transactions</Link>{" "}
        <PrintButton />{" "}
        <a href={`/financials/download/voucher-pdf?id=${t.id}`} target="_blank" rel="noreferrer" className="btn">📄 Download PDF</a>
      </div>
      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 18 }}><div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{parish}</div><div style={{ fontWeight: 700, fontSize: "1.3rem" }}>{income ? "Receipt Voucher" : "Payment Voucher"}</div></div>
        <div className="table-wrap"><table><tbody>
          <Row k="Cost Center Account" v={t.costCenterAccount ?? parish} /><Row k="Date" v={formatDate(t.transactionDate)} /><Row k="General Ledger Account" v={t.categoryName} />
          <Row k="Type" v={income ? "Income" : "Expense"} /><Row k="P.V. No." v={t.pvNo ?? ""} /><Row k="Cash / Cheque" v={t.paymentMethod ? t.paymentMethod[0]!.toUpperCase() + t.paymentMethod.slice(1) : ""} /><Row k="Invoice Date" v={formatDate(t.invoiceDate)} />
        </tbody></table></div>
        <h3>Detail of Payment</h3>
        <p style={{ border: "1px solid var(--border)", padding: 10, minHeight: 40, whiteSpace: "pre-wrap" }}>{t.description || "(no description given)"}</p>
        <div className="table-wrap"><table><tbody><Row k="Amount" v={fmtMoney(t.amount)} /><Row k="Amount in Words" v={t.amountInWords ?? amountToWords(t.amount)} /></tbody></table></div>
        <div style={{ marginTop: 30 }}>
          <p>Approved by: ______________________&nbsp;&nbsp;&nbsp;Date: __________</p>
          <p>Prepared by: {t.preparedBy || "______________________"}</p>
          <p>Received by: {t.receivedBy || "______________________"}&nbsp;&nbsp;&nbsp;Date: {t.receivedDate ? formatDate(t.receivedDate) : "__________"}</p>
        </div>
      </div>
    </>
  );
}
