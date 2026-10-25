import { redirect } from "next/navigation";
import { isValidIsoDate } from "@/lib/dates";

/** Small, strict FormData readers so server actions never trust raw browser input. */
export const str = (fd: FormData, k: string, max = 500): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};
export const optStr = (fd: FormData, k: string, max = 500): string | null => str(fd, k, max) || null;
export const intOf = (fd: FormData, k: string): number | null => {
  const v = str(fd, k, 20);
  return /^-?\d{1,12}$/.test(v) ? Number(v) : null;
};
export const moneyOf = (fd: FormData, k: string): number | null => {
  const v = str(fd, k, 20).replace(/,/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return null;
  return Number(v);
};
export const dateOf = (fd: FormData, k: string): string | null => {
  const v = str(fd, k, 10);
  return isValidIsoDate(v) ? v : null;
};
export const checked = (fd: FormData, k: string): boolean => str(fd, k, 5) === "1";
export const oneOf = <T extends string>(fd: FormData, k: string, allowed: readonly T[]): T | null => {
  const v = str(fd, k, 60);
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
};

/** Redirect back to a page with a one-shot status message in the query string (rendered by <Notice/>). */
export function back(path: string, kind: "ok" | "error", message: string, extra: Record<string, string> = {}): never {
  const p = new URLSearchParams({ ...extra, [kind]: message });
  redirect(`${path}${path.includes("?") ? "&" : "?"}${p.toString()}`);
}

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
