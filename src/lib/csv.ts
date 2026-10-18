/** RFC-4180 CSV with spreadsheet formula-injection neutralisation (=, +, -, @, tab, CR). */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = neutraliseFormula(String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Iterable<unknown[]>): string {
  const lines = [header.map(cell).join(",")];
  for (const r of rows) lines.push(r.map(cell).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8 correctly
}

export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}
