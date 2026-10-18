import { roleCan, type Permission, type Role } from "@/lib/auth/permissions";

export interface NavItem { href: string; label: string; permission?: Permission }
export interface NavTopItem extends NavItem { icon: string }
export interface NavGroup { label: string; icon: string; items: NavItem[] }

/**
 * Same top bar structure as the PHP app (includes/header.php): two top-level links, then
 * grouped dropdowns. Only screens that exist in the Next.js port are listed; the rest come
 * back as they are ported (see MIGRATION.md). Visibility is derived from permissions.
 */
export const NAV_TOP: NavTopItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/search", label: "Search All", icon: "search", permission: "registers" },
];

export const NAV: NavGroup[] = [
  {
    label: "Registers", icon: "book",
    items: [
      { href: "/registers/baptism", label: "Baptism", permission: "registers" },
      { href: "/registers/communion", label: "First Communion", permission: "registers" },
      { href: "/registers/confirmation", label: "Confirmation", permission: "registers" },
      { href: "/registers/holy_orders", label: "Holy Orders", permission: "registers" },
      { href: "/registers/death", label: "Death", permission: "registers" },
    ],
  },
  {
    label: "Sacramental Life", icon: "flame",
    items: [
      { href: "/registers/marriage_prep", label: "Marriage Preparation", permission: "registers" },
      { href: "/registers/candidates", label: "Sacrament Prep & RCIA", permission: "registers" },
      { href: "/registers/sick_calls", label: "Sick & Anointing", permission: "sensitive.sick" },
    ],
  },
  {
    label: "Parish Life", icon: "users",
    items: [
      { href: "/registers/parishioners", label: "Parishioners", permission: "registers" },
      { href: "/registers/outstations", label: "Outstations", permission: "registers" },
      { href: "/registers/societies", label: "Societies & Groups", permission: "registers" },
      { href: "/registers/catechesis_teachers", label: "Catechists", permission: "registers" },
      { href: "/registers/parish_priests", label: "Parish Priests", permission: "registers" },
      { href: "/registers/counsellors", label: "Marriage Counsellors", permission: "registers" },
    ],
  },
  {
    label: "Liturgy", icon: "calendar",
    items: [
      { href: "/registers/mass_times", label: "Mass Times", permission: "registers" },
      { href: "/registers/liturgical_days", label: "Feast Days", permission: "registers" },
    ],
  },
  {
    label: "Finance & Property", icon: "coins",
    items: [
      { href: "/registers/church_property", label: "Church Property", permission: "registers" },
    ],
  },
  {
    label: "Admin", icon: "settings",
    items: [
      { href: "/admin/users", label: "Manage Users", permission: "users.manage" },
      { href: "/admin/audit", label: "Audit Trail", permission: "audit.view" },
      { href: "/admin/access-log", label: "Access Log", permission: "access_log.view" },
    ],
  },
];

const allowed = (role: Role, p?: Permission) => !p || roleCan(role, p);

export function visibleNav(role: Role): { top: NavTopItem[]; groups: NavGroup[] } {
  return {
    top: NAV_TOP.filter((i) => allowed(role, i.permission)),
    groups: NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(role, i.permission)) })).filter((g) => g.items.length),
  };
}
