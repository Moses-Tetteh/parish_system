"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/registers/form-model";
import { CATEGORIES, LEGACY_CATEGORIES } from "@/lib/announcements/categories";
import { RichTextEditor } from "@/components/RichTextEditor";

export function AnnouncementForm({ initial, action }: { initial: Record<string, string>; action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const v = (k: string) => state.values?.[k] ?? initial[k] ?? "";
  const err = (k: string) => state.errors?.[k];
  const cats: Record<string, string> = { ...CATEGORIES, ...(v("category") in LEGACY_CATEGORIES ? LEGACY_CATEGORIES : {}) };
  return (
    <form action={formAction} noValidate className="card" style={{ maxWidth: 820 }}>
      {state.message && <div role="alert" className="flash flash-error">{state.message}</div>}
      <div className="form-grid">
        <div className="field"><label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={v("category") || "notice"}>{Object.entries(cats).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="announcement_date">Mass date<span className="req"> *</span></label>
          <input id="announcement_date" type="date" name="announcement_date" defaultValue={v("announcement_date")} className={err("announcement_date") ? "is-invalid" : undefined} />
          <p className="field-hint">The Sunday/Mass this is read at — not today’s date.</p>
          {err("announcement_date") && <p className="field-error" role="alert">{err("announcement_date")}</p>}</div>
        <div className="field full"><label htmlFor="title">Title<span className="req"> *</span></label>
          <input id="title" name="title" maxLength={200} defaultValue={v("title")} className={err("title") ? "is-invalid" : undefined} />
          {err("title") && <p className="field-error" role="alert">{err("title")}</p>}</div>
        <RichTextEditor name="content" label="Announcement text" initialHtml={v("content")} error={err("content")} />
        <div className="field"><label htmlFor="submitted_by_name">Submitted by</label><input id="submitted_by_name" name="submitted_by_name" maxLength={200} defaultValue={v("submitted_by_name")} /></div>
        <div className="field"><label htmlFor="submitted_by_contact">Contact (office use only — never printed)</label><input id="submitted_by_contact" name="submitted_by_contact" maxLength={200} defaultValue={v("submitted_by_contact")} /></div>
      </div>
      <div className="form-actions"><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "💾 Save"}</button><Link href="/announcements" className="btn btn-secondary">Cancel</Link></div>
    </form>
  );
}
