import "server-only";
import { and, inArray, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAccess } from "@/lib/audit";
import { roleCan } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { MARRIAGE_DEF, SPOUSE_DEF } from "@/lib/matrimony/fields";
import { MarriageRuleError, saveMarriage } from "@/lib/matrimony/repository";
import { ForbiddenError } from "@/lib/registers/repository";
import { nameKey } from "@/lib/parishioners/name-matcher";
import type { FieldDef } from "@/lib/registers/types";
import type { Values } from "@/lib/registers/validation";
import { buildPairedRows, convertCell, isBlankMarker, isBlankRow, parsePartialDate } from "./convert";

export type Layout = "combined" | "paired";

/** Every importable field: marriage fields, then "Groom — …" and "Bride — …" copies of the spouse fields. */
export interface ImportField { key: string; label: string; def: FieldDef; part: "marriage" | "groom" | "bride" }
const prefixed = (role: "groom" | "bride", name: string): ImportField[] =>
  SPOUSE_DEF.fields.map((f) => ({ key: `${role}_${f.key}`, label: `${name} — ${f.label}`, def: f, part: role }));

export const MARRIAGE_FIELDS: ImportField[] = MARRIAGE_DEF.fields.map((f) => ({ key: f.key, label: f.label, def: f, part: "marriage" as const }));
export const COMBINED_FIELDS: ImportField[] = [...MARRIAGE_FIELDS, ...prefixed("groom", "Groom"), ...prefixed("bride", "Bride")];
/** In a one-person-per-row sheet the mapping UI lists marriage fields plus ONE set of spouse fields. */
export const PAIRED_MAPPING_FIELDS: { key: string; label: string }[] = [
  ...MARRIAGE_FIELDS, ...SPOUSE_DEF.fields.map((f) => ({ key: f.key, label: f.label })),
];
export const mappingFieldsFor = (layout: Layout): { key: string; label: string; required?: boolean }[] =>
  layout === "paired"
    ? PAIRED_MAPPING_FIELDS.map((f) => ({ ...f, required: !!SPOUSE_DEF.fields.find((s) => s.key === f.key)?.required }))
    : COMBINED_FIELDS.map((f) => ({ key: f.key, label: f.label, required: !!f.def.required }));

export interface ImportInput { rows: string[][]; hasHeader: boolean; layout: Layout; mapping: Record<string, number | null> }

export interface RowResult {
  rowNumber: number;
  status: "ready" | "error" | "duplicate";
  errors: string[];
  warnings: string[];
  summary: { recordNo: string; groom: string; bride: string; date: string };
  data?: { marriage: Values; groom: Values; bride: Values };
}
export interface Preview { results: RowResult[]; notes: string[]; counts: { ready: number; error: number; duplicate: number } }

const MAX_ROWS_CHECKED = 5000;

type Raw = { data: Record<string, string | number | null>; errors: string[]; warnings: string[]; refs: Record<string, string> };

/** Converts one combined row into typed values; baptism numbers are collected for one batched lookup. */
function convertRow(row: string[], mapping: Record<string, number | null>): Raw {
  const data: Raw["data"] = {}, errors: string[] = [], warnings: string[] = [], refs: Record<string, string> = {};
  for (const f of COMBINED_FIELDS) {
    const col = mapping[f.key];
    let raw: string | null = col === null || col === undefined ? null : (row[col] ?? "").trim();
    if (raw !== null && isBlankMarker(raw)) raw = null;
    if (raw === "") raw = null;

    if (f.def.type === "partial_date") {
      if (raw === null) {
        if (f.def.required) errors.push(`'${f.label}' is required but was empty.`);
        data[`${f.key}_year`] = data[`${f.key}_month`] = data[`${f.key}_day`] = null;
        continue;
      }
      const p = parsePartialDate(raw);
      if (p.error) errors.push(`'${f.label}': ${p.error}`);
      else { data[`${f.key}_year`] = p.year; data[`${f.key}_month`] = p.month; data[`${f.key}_day`] = p.day; }
      continue;
    }
    if (f.def.type === "baptism_ref") { if (raw !== null) refs[f.key] = raw; continue; }

    const r = convertCell(raw, f.def);
    if (r.error) errors.push(r.error);
    else if (f.def.required && (r.value === null || r.value === "")) errors.push(`'${f.label}' is required but was empty.`);
    else data[f.key] = r.value;
    if (r.warning) warnings.push(`'${f.label}': ${r.warning}`);
  }
  return { data, errors, warnings, refs };
}

function split(data: Raw["data"], part: "groom" | "bride"): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries(data)) if (k.startsWith(`${part}_`)) out[k.slice(part.length + 1)] = v;
  return out;
}
function marriagePart(data: Raw["data"]): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries(data)) if (!k.startsWith("groom_") && !k.startsWith("bride_")) out[k] = v;
  return out;
}

/** Validates the whole sheet against the register WITHOUT writing anything. */
export async function buildPreview(user: SessionUser, input: ImportInput): Promise<Preview> {
  if (!roleCan(user.role, "registers")) throw new ForbiddenError();
  const notes: string[] = [];
  const fieldKeys = COMBINED_FIELDS.map((f) => f.key);
  let mapping = input.mapping;

  let rows: string[][] = [], rowNumbers: number[] = [];
  if (input.layout === "paired") {
    const paired = buildPairedRows(input.rows, input.hasHeader, mapping, fieldKeys);
    rows = paired.rows; rowNumbers = paired.rowNumbers; notes.push(...paired.notes);
    // paired rows are already in combined shape: map each field to its own position
    mapping = Object.fromEntries(fieldKeys.map((k, i) => [k, i])) as Record<string, number | null>;
  } else {
    const start = input.hasHeader ? 1 : 0;
    for (let i = start; i < input.rows.length; i++) if (!isBlankRow(input.rows[i]!)) { rows.push(input.rows[i]!); rowNumbers.push(i + 1); }
  }
  if (rows.length > MAX_ROWS_CHECKED) { rows = rows.slice(0, MAX_ROWS_CHECKED); notes.push(`Only the first ${MAX_ROWS_CHECKED} marriages are checked per upload.`); }

  const converted = rows.map((r) => convertRow(r, mapping));

  // ---- baptism numbers: ONE query for the whole sheet
  const wanted = [...new Set(converted.flatMap((c) => Object.values(c.refs)))];
  const baptismByNo = new Map<string, number[]>();
  if (wanted.length) {
    const found = await db().select({ id: schema.baptismRecords.id, no: schema.baptismRecords.recordNo }).from(schema.baptismRecords)
      .where(and(inArray(schema.baptismRecords.recordNo, wanted), eq(schema.baptismRecords.isArchived, 0)));
    for (const b of found) baptismByNo.set(b.no ?? "", [...(baptismByNo.get(b.no ?? "") ?? []), b.id]);
  }

  // ---- duplicates: same record number, or the same couple on the same date (guards against importing a file twice)
  const nos = [...new Set(converted.map((c) => String(c.data.record_no ?? "")).filter(Boolean))];
  const existingNos = new Set<string>();
  if (nos.length) for (const r of await db().select({ n: schema.matrimonyRecords.recordNo }).from(schema.matrimonyRecords).where(inArray(schema.matrimonyRecords.recordNo, nos))) existingNos.add(r.n ?? "");
  const dates = [...new Set(converted.map((c) => String(c.data.date_of_marriage ?? "")).filter(Boolean))];
  const existingCouples = new Set<string>();
  if (dates.length) {
    const pairs = await db().select({ id: schema.matrimonyRecords.id, date: schema.matrimonyRecords.dateOfMarriage, role: schema.spouses.role, g: schema.spouses.givenName, s: schema.spouses.surname })
      .from(schema.matrimonyRecords).innerJoin(schema.spouses, eq(schema.spouses.matrimonyId, schema.matrimonyRecords.id))
      .where(inArray(schema.matrimonyRecords.dateOfMarriage, dates));
    const byId = new Map<number, { date: string; groom?: string; bride?: string }>();
    for (const p of pairs) {
      const e = byId.get(p.id) ?? { date: p.date ?? "" };
      e[p.role as "groom" | "bride"] = nameKey(`${p.g} ${p.s}`); byId.set(p.id, e);
    }
    for (const e of byId.values()) existingCouples.add(`${e.groom}|${e.bride}|${e.date}`);
  }

  const seenNos = new Map<string, number>(), seenCouples = new Map<string, number>();
  const results: RowResult[] = converted.map((c, idx) => {
    const rowNumber = rowNumbers[idx]!;
    const errors = [...c.errors], warnings = [...c.warnings];
    const g = split(c.data, "groom"), b = split(c.data, "bride"), m = marriagePart(c.data);

    // baptism numbers -> ids (unmatched = left unlinked, as in the PHP app; never fails the row)
    for (const [key, no] of Object.entries(c.refs)) {
      const ids = baptismByNo.get(no) ?? [];
      const target = key.startsWith("groom_") ? g : b;
      if (ids.length === 1) target.baptism_register_ref = ids[0]!;
      else warnings.push(`${key.startsWith("groom_") ? "Groom" : "Bride"} baptism no. "${no}" ${ids.length ? "matches several baptism records" : "was not found"}: left unlinked.`);
    }

    const recordNo = String(m.record_no ?? "");
    const couple = `${nameKey(`${g.given_name ?? ""} ${g.surname ?? ""}`)}|${nameKey(`${b.given_name ?? ""} ${b.surname ?? ""}`)}|${m.date_of_marriage ?? ""}`;
    let status: RowResult["status"] = errors.length ? "error" : "ready";
    if (status === "ready") {
      if (recordNo && existingNos.has(recordNo)) { status = "duplicate"; errors.push(`Record No. "${recordNo}" is already in the Holy Matrimony register.`); }
      else if (recordNo && seenNos.has(recordNo)) { status = "duplicate"; errors.push(`Record No. "${recordNo}" appears twice in this file (first at row ${seenNos.get(recordNo)}).`); }
      else if (m.date_of_marriage && (existingCouples.has(couple) || seenCouples.has(couple))) {
        status = "duplicate"; errors.push("This couple is already recorded for this date (same names, same date).");
      }
    }
    if (status === "ready") { if (recordNo) seenNos.set(recordNo, rowNumber); if (m.date_of_marriage) seenCouples.set(couple, rowNumber); }
    if (!m.marriage_type) m.marriage_type = "catholic"; // the column is NOT NULL, default Catholic

    return {
      rowNumber, status, errors, warnings,
      summary: { recordNo, groom: `${g.given_name ?? ""} ${g.surname ?? ""}`.trim(), bride: `${b.given_name ?? ""} ${b.surname ?? ""}`.trim(), date: String(m.date_of_marriage ?? "") },
      data: status === "ready" ? { marriage: m, groom: g, bride: b } : undefined,
    };
  });

  const counts = { ready: 0, error: 0, duplicate: 0 };
  for (const r of results) counts[r.status]++;
  return { results, notes, counts };
}

export interface CommitResult { created: number; skipped: number; failed: { rowNumber: number; error: string }[]; parishioners: { created: number; linked: number; flagged: number } }

/**
 * Saves one window of the validated rows. The sheet is re-validated on every call, so rows that an earlier chunk (or an earlier
 * attempt) already saved show up as duplicates and are skipped: re-running an import is always safe.
 * Each marriage goes through the same saveMarriage() as the normal form: transaction, audit, marginal notes, Holy-Orders rule,
 * and the Parishioners sync.
 */
export async function commitWindow(user: SessionUser, input: ImportInput, offset: number, limit: number): Promise<CommitResult> {
  const preview = await buildPreview(user, input);
  const ready = preview.results.filter((r) => r.status === "ready");
  const window = preview.results.slice(offset, offset + limit);
  const out: CommitResult = { created: 0, skipped: 0, failed: [], parishioners: { created: 0, linked: 0, flagged: 0 } };
  for (const r of window) {
    if (r.status !== "ready" || !r.data) { out.skipped++; continue; }
    try {
      const saved = await saveMarriage(user, null, r.data);
      if (saved === "conflict") { out.failed.push({ rowNumber: r.rowNumber, error: "could not be saved (conflict)." }); continue; }
      out.created++;
      if (saved.sync) { out.parishioners.created += saved.sync.created; out.parishioners.linked += saved.sync.linked + saved.sync.updated; out.parishioners.flagged += saved.sync.flagged; }
    } catch (e) {
      if (e instanceof ForbiddenError) throw e;
      out.failed.push({ rowNumber: r.rowNumber, error: e instanceof MarriageRuleError ? e.message : "could not be saved." });
      if (!(e instanceof MarriageRuleError)) console.error("import row failed", r.rowNumber, e);
    }
  }
  if (offset + limit >= preview.results.length) {
    await logAccess({ username: user.username, role: user.role, action: "import", resource: "matrimony", detail: `${ready.length} ready of ${preview.results.length} rows` });
  }
  return out;
}
