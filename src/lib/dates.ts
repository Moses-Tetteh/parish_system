/** Date helpers. Dates travel as plain "YYYY-MM-DD" strings end-to-end (no Date objects => no timezone drift). */

export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1000 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(n: number): string {
  return MONTHS[n - 1] ?? "";
}

/** Birth dates in old registers are often only partly known: "1954", "March 1954" or a full date. */
export function formatPartialDate(year?: number | null, month?: number | null, day?: number | null): string {
  if (!year) return "";
  if (!month) return String(year);
  if (!day) return `${monthName(month)} ${year}`;
  return `${day} ${monthName(month)} ${year}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value || !isValidIsoDate(value.slice(0, 10))) return value ?? "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${d} ${monthName(m)} ${y}`;
}

const FALLBACK_TZ = "Africa/Accra";
const tzCache = new Map<string, string>();

/**
 * The time zone "today" is computed in. Reads APP_TIMEZONE, then TZ, and ALWAYS returns something Intl accepts:
 * hosts such as Vercel set TZ=":UTC" (valid for the OS, a RangeError for JavaScript), so a leading ":" is stripped,
 * and anything still invalid falls back to Africa/Accra (UTC+0 all year, same as UTC).
 */
export function parishTimeZone(): string {
  const raw = (process.env.APP_TIMEZONE || process.env.TZ || "").trim();
  const hit = tzCache.get(raw);
  if (hit) return hit;
  const candidate = raw.replace(/^:/, "") || FALLBACK_TZ;
  let tz = FALLBACK_TZ;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: candidate }); tz = candidate; } catch { /* unusable value: keep the fallback */ }
  tzCache.set(raw, tz);
  return tz;
}

export function todayIso(tz = parishTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}