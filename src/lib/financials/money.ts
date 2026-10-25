/** Money is held as integer pesewas inside calculations so sums never drift (0.1 + 0.2 problems). */
export const toPesewas = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const fromPesewas = (p: number): number => p / 100;
export const fmtMoney = (v: unknown): string =>
  (Number(v ?? 0) || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
