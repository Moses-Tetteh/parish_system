/**
 * "Either Holy Matrimony or Holy Orders" rule. Pure functions (no server-only imports) so the browser
 * form (to hide the other side instantly) and the server (to ENFORCE it) share ONE definition.
 */
export interface ExclusiveSide {
  /** The status <select> (received_here / received_elsewhere / not_received / unknown). */
  status: string;
  /** Fields that only make sense when this sacrament was received. */
  fields: string[];
  label: string;
}
export interface ExclusiveRule { a: ExclusiveSide; b: ExclusiveSide }

export const RECEIVED_VALUES = ["received_here", "received_elsewhere"] as const;
export const isReceived = (v: unknown): boolean => RECEIVED_VALUES.includes(v as (typeof RECEIVED_VALUES)[number]);

/** Add a register here to give it the same rule. */
export const EXCLUSIVE_RULES: Record<string, ExclusiveRule> = {
  parishioners: {
    a: { label: "Holy Matrimony", status: "matrimony_status", fields: ["marriage_date", "marriage_place"] },
    b: { label: "Holy Orders", status: "orders_status", fields: ["orders_type", "orders_date", "orders_place", "orders_id"] },
  },
};

/** Which fields the form must hide, given the two current status values. */
export function hiddenFields(rule: ExclusiveRule, statusA: unknown, statusB: unknown): Set<string> {
  const hidden = new Set<string>();
  const aOn = isReceived(statusA), bOn = isReceived(statusB);
  if (bOn && !aOn) [rule.a.status, ...rule.a.fields].forEach((f) => hidden.add(f));
  if (aOn && !bOn) [rule.b.status, ...rule.b.fields].forEach((f) => hidden.add(f));
  return hidden;
}

/**
 * Server-side enforcement on the parsed values. Never trusts the browser:
 *  - both received  -> validation error (the person must be one or the other);
 *  - one received   -> the other side is reset to "not_received" and its details are cleared.
 */
export function applyExclusive<V extends Record<string, string | number | null>>(
  rule: ExclusiveRule, values: V,
): { values: V; error?: { field: string; message: string } } {
  const aOn = isReceived(values[rule.a.status]), bOn = isReceived(values[rule.b.status]);
  if (aOn && bOn) {
    return {
      values,
      error: { field: rule.b.status, message: `${rule.a.label} and ${rule.b.label} cannot both be recorded for the same person. Choose one.` },
    };
  }
  const out: Record<string, string | number | null> = { ...values };
  const clear = (side: ExclusiveSide) => {
    if (side.status in out) out[side.status] = "not_received";
    for (const f of side.fields) if (f in out) out[f] = null;
  };
  if (aOn) clear(rule.b);
  if (bOn) clear(rule.a);
  return { values: out as V };
}
