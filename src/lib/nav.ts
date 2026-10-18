import { roleCan, type Permission, type Role } from "@/lib/auth/permissions";

export interface NavItem { href: string; label: string; permission?: Permission }
export interface NavGroup { label: string; items: NavItem[] }

/** Navigation is derived from permissions, never hand-filtered per role. */
export const NAV: NavGroup[] = [
  {
    label: "Sacraments",
    items: [
      { href: "/registers/baptism", label: "Baptism", permission: "registers" },
      { href: "/registers/communion", label: "First Communion", permission: "registers" },
      { href: "/registers/confirmation", label: "Confirmation", permission: "registers" },
      { href: "/registers/death", label: "Death", permission: "registers" },
      { href: "/registers/burial_records", label: "Burial", permission: "registers" },
      { href: "/registers/holy_orders", label: "Holy Orders", permission: "registers" },
    ],
  },
  {
    label: "Parish life",
    items: [
      { href: "/registers/parishioners", label: "Parishioners", permission: "registers" },
      { href: "/registers/marriage_prep", label: "Marriage preparation", permission: "registers" },
      { href: "/registers/candidates", label: "Sacrament prep / RCIA", permission: "registers" },
      { href: "/registers/mass_intentions", label: "Mass intentions", permission: "registers" },
      { href: "/registers/sick_calls", label: "Sick & anointing", permission: "sensitive.sick" },
      { href: "/registers/societies", label: "Societies & groups", permission: "registers" },
      { href: "/registers/outstations", label: "Outstations", permission: "registers" },
    ],
  },
  {
    label: "Parish setup",
    items: [
      { href: "/registers/parish_priests", label: "Parish priests", permission: "registers" },
      { href: "/registers/catechesis_teachers", label: "Catechists", permission: "registers" },
      { href: "/registers/counsellors", label: "Counsellors", permission: "registers" },
      { href: "/registers/mass_times", label: "Mass times", permission: "registers" },
      { href: "/registers/liturgical_days", label: "Feast days", permission: "registers" },
      { href: "/registers/church_property", label: "Church property", permission: "registers" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", permission: "users.manage" },
      { href: "/admin/audit", label: "Audit trail", permission: "audit.view" },
      { href: "/admin/access-log", label: "Access log", permission: "access_log.view" },
    ],
  },
];

export function visibleNav(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || roleCan(role, i.permission)) })).filter((g) => g.items.length);
}
