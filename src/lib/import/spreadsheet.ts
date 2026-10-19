import "server-only";
import { readSheet } from "read-excel-file/universal";

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_COLS = 60;

export class SpreadsheetError extends Error {}

export interface ParsedSheet { rows: string[][]; truncated: boolean }

const pad = (n: number) => String(n).padStart(2, "0");

/** One cell as plain text. Excel dates become ISO dates (UTC, so no timezone can shift the day). */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
  return String(v).replace(/\u0000/g, "").trim();
}

function shape(grid: unknown[][]): ParsedSheet {
  const truncated = grid.length > MAX_ROWS;
  const rows = grid.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map(cellText));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return { rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]), truncated };
}

// ---------------------------------------------------------------- CSV (RFC 4180 + the delimiter Excel actually used)
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  let best = ",", bestCount = -1;
  for (const d of [",", ";", "\t"]) {
    let n = 0, inQ = false;
    for (const ch of first) { if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) n++; }
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

export function parseCsv(text: string): string[][] {
  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = ""; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Excel's "CSV UTF-8" is UTF-8 with a BOM, but plain "CSV" on Windows is Windows-1252: try UTF-8 strictly, then fall back. */
export function decodeCsv(buf: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

/** Reads an uploaded .xlsx or .csv. Anything else is refused with a plain-English reason. */
export async function parseSpreadsheet(name: string, bytes: Uint8Array): Promise<ParsedSheet> {
  if (bytes.byteLength === 0) throw new SpreadsheetError("The file is empty.");
  if (bytes.byteLength > MAX_BYTES) throw new SpreadsheetError(`The file is larger than ${MAX_BYTES / 1024 / 1024} MB. Split it into smaller files.`);
  const lower = name.toLowerCase();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": every .xlsx is a zip

  if (lower.endsWith(".xlsx")) {
    if (!isZip) throw new SpreadsheetError("That file is not a real Excel (.xlsx) workbook. Open it in Excel and use Save As → Excel Workbook (.xlsx).");
    try {
      const grid = await readSheet(new Blob([bytes as BlobPart]));
      return shape(grid as unknown[][]);
    } catch (e) {
      console.error("xlsx parse failed", e);
      throw new SpreadsheetError("Could not read that Excel file. Check it opens normally, or save it as CSV and try again.");
    }
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    if (isZip) throw new SpreadsheetError("That file looks like an Excel workbook but is named .csv. Rename it to .xlsx.");
    return shape(parseCsv(decodeCsv(bytes)));
  }
  if (lower.endsWith(".xls")) throw new SpreadsheetError("Old Excel (.xls) files are not supported. Open it in Excel and Save As → Excel Workbook (.xlsx), then upload that.");
  throw new SpreadsheetError("Upload an Excel (.xlsx) or CSV file.");
}
