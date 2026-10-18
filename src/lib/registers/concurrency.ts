/** A version token is the row's updated_at as Postgres printed it. Validate before it reaches SQL (it is also bound as a parameter). */
export function isValidVersion(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/.test(v);
}
