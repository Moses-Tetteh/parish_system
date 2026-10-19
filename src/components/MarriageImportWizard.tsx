"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { autoSuggestMapping, columnLetter } from "@/lib/import/convert";
import type { PreviewView, ReadState } from "@/app/(app)/matrimony/import/actions";
import type { CommitResult } from "@/lib/import/marriage-import";

type Field = { key: string; label: string; required?: boolean };
type Layout = "combined" | "paired";
type Payload = { rows: string[][]; hasHeader: boolean; layout: Layout; mapping: Record<string, number | null> };

type Props = {
  readAction: (prev: ReadState, fd: FormData) => Promise<ReadState>;
  previewAction: (input: unknown) => Promise<PreviewView | { error: string }>;
  commitAction: (input: unknown, offset: number, limit: number) => Promise<CommitResult | { error: string }>;
  combinedFields: Field[];
  pairedFields: Field[];
};

const CHUNK = 20; // marriages saved per request: keeps every request short on serverless hosting
const SHOWN = 300; // rows listed in the preview table

type Totals = { created: number; skipped: number; failed: { rowNumber: number; error: string }[]; parishioners: { created: number; linked: number; flagged: number } };

export function MarriageImportWizard({ readAction, previewAction, commitAction, combinedFields, pairedFields }: Props) {
  const [readState, readFormAction, reading] = useActionState<ReadState, FormData>(readAction, {});
  const [hasHeader, setHasHeader] = useState(true);
  const [layout, setLayout] = useState<Layout>("combined");
  // which sheet the mapping was built for: switching layout/header rebuilds the suggestion
  const sheet = readState.sheet;
  const fields = layout === "paired" ? pairedFields : combinedFields;

  const headers = useMemo(() => {
    if (!sheet) return [] as string[];
    const width = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0);
    return Array.from({ length: width }, (_, i) => (hasHeader ? sheet.rows[0]?.[i] ?? "" : ""));
  }, [sheet, hasHeader]);

  const suggested = useMemo(() => autoSuggestMapping(fields, headers), [fields, headers]);
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const mapping: Record<string, number | null> = { ...suggested, ...overrides };

  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const payload = (): Payload => ({ rows: sheet!.rows, hasHeader, layout, mapping });

  const runPreview = () => {
    setMessage(null); setTotals(null);
    startBusy(async () => {
      const res = await previewAction(payload());
      if ("error" in res) setMessage(res.error); else setPreview(res);
    });
  };

  const runImport = () => {
    if (!preview) return;
    setMessage(null);
    startBusy(async () => {
      const total = preview.results.length;
      const sum: Totals = { created: 0, skipped: 0, failed: [], parishioners: { created: 0, linked: 0, flagged: 0 } };
      setProgress({ done: 0, total });
      let stopped: string | null = null;
      for (let offset = 0; offset < total; offset += CHUNK) {
        const res = await commitAction(payload(), offset, CHUNK);
        if ("error" in res) { stopped = res.error; break; }
        sum.created += res.created; sum.skipped += res.skipped; sum.failed.push(...res.failed);
        sum.parishioners.created += res.parishioners.created; sum.parishioners.linked += res.parishioners.linked; sum.parishioners.flagged += res.parishioners.flagged;
        setProgress({ done: Math.min(offset + CHUNK, total), total });
      }
      setProgress(null);
      if (stopped) {
        // Stay on the checking screen and say exactly what happened; never show a false "finished".
        setMessage(`${stopped} ${sum.created} marriage${sum.created === 1 ? " was" : "s were"} saved before the problem. Go back, check the file again and import again: marriages already saved are recognised and skipped.`);
        return;
      }
      setTotals(sum); setPreview(null);
    });
  };

  // ------------------------------------------------------------ finished
  if (totals) {
    return (
      <div className="card">
        <div className={`flash ${totals.failed.length ? "flash-error" : "flash-success"}`} role="status">
          Import finished: <strong>{totals.created}</strong> marriage{totals.created === 1 ? "" : "s"} added, {totals.skipped} skipped
          {totals.failed.length ? `, ${totals.failed.length} could not be saved` : ""}.
        </div>
        <p>Parishioners list updated: {totals.parishioners.created} added, {totals.parishioners.linked} linked/updated{totals.parishioners.flagged ? `, ${totals.parishioners.flagged} flagged for review` : ""}.</p>
        {totals.failed.length > 0 && (
          <ul>{totals.failed.map((f) => <li key={f.rowNumber}>Row {f.rowNumber}: {f.error}</li>)}</ul>
        )}
        <p className="hint">Importing the same file again is safe: marriages already in the register are recognised and skipped.</p>
        <Link href="/matrimony" className="btn">Go to the Holy Matrimony register</Link>
      </div>
    );
  }

  // ------------------------------------------------------------ 3. preview
  if (preview && sheet) {
    const rows = (onlyProblems ? preview.results.filter((r) => r.status !== "ready" || r.warnings.length) : preview.results).slice(0, SHOWN);
    return (
      <div className="card">
        <h2>Check before importing</h2>
        {message && <div role="alert" className="flash flash-error">{message}</div>}
        <p>
          <span className="badge badge-cert-approved">{preview.counts.ready} ready</span>{" "}
          {preview.counts.duplicate > 0 && <span className="badge badge-cert-pending_approval">{preview.counts.duplicate} already in the register</span>}{" "}
          {preview.counts.error > 0 && <span className="badge badge-archived">{preview.counts.error} with problems</span>}
        </p>
        {preview.notes.map((n) => <p key={n} className="hint">{n}</p>)}
        <p className="hint">Rows with problems or duplicates are <strong>not</strong> imported; fix them in your spreadsheet and upload again (rows already imported are skipped automatically).</p>
        <label className="inline-label"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows needing attention</label>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Row</th><th scope="col">Record No.</th><th scope="col">Groom</th><th scope="col">Bride</th><th scope="col">Date</th><th scope="col">Result</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowNumber}>
                  <td>{r.rowNumber}</td><td>{r.summary.recordNo}</td><td>{r.summary.groom}</td><td>{r.summary.bride}</td><td>{r.summary.date}</td>
                  <td>
                    <span className={`badge ${r.status === "ready" ? "badge-cert-approved" : r.status === "duplicate" ? "badge-cert-pending_approval" : "badge-archived"}`}>
                      {r.status === "ready" ? "Ready" : r.status === "duplicate" ? "Duplicate" : "Problem"}
                    </span>
                    {r.errors.map((e) => <div key={e}><small>{e}</small></div>)}
                    {r.warnings.map((w) => <div key={w}><small>⚠ {w}</small></div>)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}>Nothing to show.</td></tr>}
            </tbody>
          </table>
        </div>
        {preview.results.length > SHOWN && !onlyProblems && <p className="hint">Showing the first {SHOWN} of {preview.results.length} rows.</p>}

        {progress ? (
          <div role="status" aria-live="polite">
            <progress value={progress.done} max={progress.total} style={{ width: "100%" }} />
            <p className="hint">Saving… {progress.done} of {progress.total} rows. Keep this page open.</p>
          </div>
        ) : (
          <div className="form-actions">
            <button type="button" className="btn" disabled={busy || preview.counts.ready === 0} onClick={runImport}>
              ✔ Import {preview.counts.ready} marriage{preview.counts.ready === 1 ? "" : "s"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPreview(null)}>← Back to column matching</button>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------ 1. upload
  if (!sheet) {
    return (
      <form action={readFormAction} className="card" style={{ maxWidth: 680 }}>
        {readState.error && <div role="alert" className="flash flash-error">{readState.error}</div>}
        <div className="field">
          <label htmlFor="file">Excel or CSV file <span className="req">*</span></label>
          <input id="file" name="file" type="file" accept=".xlsx,.csv,.tsv,.txt" required />
          <p className="hint">Old .xls files: open in Excel and use Save As → Excel Workbook (.xlsx). Up to 5 MB.</p>
        </div>
        <button type="submit" className="btn" disabled={reading}>{reading ? "Reading…" : "Read the file"}</button>
      </form>
    );
  }

  // ------------------------------------------------------------ 2. column matching
  return (
    <div className="card">
      <h2>Match the columns</h2>
      <p className="hint">File: <strong>{sheet.fileName}</strong> — {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"}{sheet.truncated ? " (only the first 5,000 were read)" : ""}.</p>
      {message && <div role="alert" className="flash flash-error">{message}</div>}

      <div className="form-grid">
        <div className="field full">
          <span className="label-like"><strong>How is each marriage laid out in your sheet?</strong></span>
          <label className="inline-label"><input type="radio" name="layout" checked={layout === "combined"} onChange={() => { setLayout("combined"); setOverrides({}); }} /> One row per marriage (groom and bride columns side by side)</label>
          <label className="inline-label"><input type="radio" name="layout" checked={layout === "paired"} onChange={() => { setLayout("paired"); setOverrides({}); }} /> One row per person (the groom’s row, then the bride’s row directly below it)</label>
        </div>
        <div className="field full">
          <label className="inline-label"><input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setOverrides({}); }} /> The first row contains column headings</label>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Register field</th><th scope="col">Column in your file</th><th scope="col">Example from the first data row</th></tr></thead>
          <tbody>
            {fields.map((f) => {
              const col = mapping[f.key] ?? null;
              const example = col === null ? "" : (sheet.rows[hasHeader ? 1 : 0]?.[col] ?? "");
              return (
                <tr key={f.key}>
                  <td><label htmlFor={`m_${f.key}`}>{f.label}{f.required && <span className="req"> *</span>}</label></td>
                  <td>
                    <select id={`m_${f.key}`} value={col === null ? "" : String(col)} onChange={(e) => setOverrides({ ...overrides, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                      <option value="">— not in my file —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{columnLetter(i)}{h ? ` — ${h}` : ""}</option>)}
                    </select>
                  </td>
                  <td><small>{example}</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" disabled={busy} onClick={runPreview}>{busy ? "Checking…" : "Check the file →"}</button>
        {/* plain link on purpose: a full navigation resets the wizard */}
        <a href="/matrimony/import" className="btn btn-secondary">Choose a different file</a>
      </div>
    </div>
  );
}
