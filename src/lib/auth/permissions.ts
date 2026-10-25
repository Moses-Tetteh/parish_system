/**
 * Single source of truth for "who may do what" (port of includes/access_policy.php).
 * Pages, actions and route handlers ask can()/requirePermission(); they never compare
 * role strings themselves, so a policy change is a one-line edit here.
 */
export const ROLES = ["admin", "priest", "secretary", "ppc_secretary"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSION_ROLES = {
  registers: ["secretary", "priest", "admin"],
  "reports.annual": ["secretary", "priest", "admin"],
  "reports.snapshot": ["priest", "admin"],
  export: ["secretary", "priest", "admin"],
  notifications: ["secretary", "priest", "admin"],
  "certificate.approve": ["priest", "admin"],
  "marriage.approve": ["priest", "admin"],
  "sponsor.override": ["priest", "admin"],
  "sensitive.sick": ["priest", "admin"],
  "sensitive.dispensation": ["priest", "admin"],
  "sensitive.irregular": ["priest", "admin"],
  "levy.view": ["secretary", "priest", "admin"],
  "levy.manage": ["priest", "admin"],
  "audit.view": ["admin"],
  "access_log.view": ["admin"],
  "users.manage": ["admin"],
  "settings.manage": ["admin"],
  // Financial split (PHP: enforce_financial_role_scope)
  "financials.core": ["secretary", "priest", "admin"], // categories, budgeting, setup
  "financials.transactions": ["secretary", "priest", "admin", "ppc_secretary"], // scoped by category for secretary / ppc
  "financials.members": ["priest", "admin", "ppc_secretary"], // Members & Dues corner
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSION_ROLES;

export function roleCan(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSION_ROLES[permission] as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  priest: "Priest",
  secretary: "Parish Secretary",
  ppc_secretary: "PPC Secretary",
};
