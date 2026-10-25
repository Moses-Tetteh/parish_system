"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "@/lib/registers/form-model";
import { amountToWords } from "@/lib/financials/words";

interface Cat { id: number; name: string; type: "income" | "expense" }
type Props = {
  categories: Cat[];
  initial: Record<string, string>;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  isNew: boolean;
};

/** Mirrors financials/form.php: type picker filters the ledger accounts, and Amount in Words fills from the amount until edited by hand. */
export function TransactionForm({ categories, initial, action, isNew }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.errors?.[k];

  const initialCat = categories.find((c) => String(c.id) === v("category_id"));
  const [type, setType] = useState<"income" | "expense">(initialCat?.type ?? "income");
  const [categoryId, setCategoryId] = useState(v("category_id"));
  const [amount, setAmount] = useState(v("amount"));
  const [words, setWords] = useState(v("amount_in_words"));
  const [touched, setTouched] = useState(!!v("amount_in_words"));

  const visible = categories.filter((c) => c.type === type);
  const onType = (t: "income" | "expense") => {
    setType(t);
    if (!categories.some((c) => c.type === t && String(c.id) === categoryId)) setCategoryId(String(categories.find((c) => c.type === t)?.id ?? ""));
  };
  const onAmount = (val: string) => {
    setAmount(val);
    if (!touched) { const n = Number(val); setWords(val && Number.isFinite(n) && n >= 0 ? amountToWords(n) : ""); }
  };
  const Err = ({ k }: { k: string }) => (err(k) ? <p className="field-error" id={`e_${k}`} role="alert">{err(k)}</p> : null);
  const cls = (k: string) => (err(k) ? "is-invalid" : undefined);

  return (
    <form action={formAction} noValidate className="card" style={{ maxWidth: 760 }}>
      {state.message && <div role="alert" className="flash flash-error">{state.message}</div>}
      {!isNew && <input type="hidden" name="_version" value={v("_version")} />}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="t_type">Type<span className="req"> *</span></label>
          <select id="t_type" value={type} onChange={(e) => onType(e.target.value as "income" | "expense")}>
            <option value="income">Income</option><option value="expense">Expense</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="category_id">General Ledger Account<span className="req"> *</span></label>
          <select id="category_id" name="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cls("category_id")} aria-invalid={!!err("category_id") || undefined}>
            {visible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Err k="category_id" />
        </div>
        <div className="field">
          <label htmlFor="cost_center_account">Cost Center Account</label>
          <input id="cost_center_account" name="cost_center_account" defaultValue={v("cost_center_account")} maxLength={150} />
        </div>
        <div className="field">
          <label htmlFor="transaction_date">Date<span className="req"> *</span></label>
          <input id="transaction_date" type="date" name="transaction_date" defaultValue={v("transaction_date")} className={cls("transaction_date")} />
          <Err k="transaction_date" />
        </div>
        <div className="field">
          <label htmlFor="pv_no">P.V. No.</label>
          <input id="pv_no" name="pv_no" defaultValue={v("pv_no")} maxLength={50} />
        </div>
        <div className="field">
          <label htmlFor="payment_method">Cash / Cheque</label>
          <select id="payment_method" name="payment_method" defaultValue={v("payment_method")}>
            <option value="">—</option><option value="cash">Cash</option><option value="cheque">Cheque</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="invoice_date">Invoice Date</label>
          <input id="invoice_date" type="date" name="invoice_date" defaultValue={v("invoice_date")} className={cls("invoice_date")} />
          <Err k="invoice_date" />
        </div>

        <h3 className="form-section">Detail of Payment</h3>
        <div className="field full">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} maxLength={500} defaultValue={v("description")} />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount<span className="req"> *</span></label>
          <input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} className={cls("amount")} aria-invalid={!!err("amount") || undefined} />
          <Err k="amount" />
        </div>
        <div className="field full">
          <label htmlFor="amount_in_words">Amount in Words</label>
          <input id="amount_in_words" name="amount_in_words" value={words} maxLength={500} placeholder="Fills in automatically from the amount — editable"
            onChange={(e) => { setTouched(true); setWords(e.target.value); }} />
        </div>

        <h3 className="form-section">Signatures</h3>
        <div className="field"><label htmlFor="approved_by">Approved By</label><input id="approved_by" name="approved_by" defaultValue={v("approved_by")} maxLength={150} /></div>
        <div className="field"><label htmlFor="prepared_by">Prepared By</label><input id="prepared_by" name="prepared_by" defaultValue={v("prepared_by")} maxLength={150} /></div>
        <div className="field"><label htmlFor="received_by">Received By</label><input id="received_by" name="received_by" defaultValue={v("received_by")} maxLength={150} /></div>
        <div className="field">
          <label htmlFor="received_date">Received Date</label>
          <input id="received_date" type="date" name="received_date" defaultValue={v("received_date")} className={cls("received_date")} />
          <Err k="received_date" />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "💾 Save"}</button>
        <Link href="/financials" className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
