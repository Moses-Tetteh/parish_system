"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The Financials sub-navigation (PHP: financials_tabs_for_role). The server passes only the tabs the role may open. */
export function FinancialsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/financials" ? path === "/financials" || path.startsWith("/financials/new") || /^\/financials\/\d+/.test(path) : path.startsWith(href));
  return (
    <nav className="subnav no-print" aria-label="Financials">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={active(t.href) ? "active" : ""} aria-current={active(t.href) ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}
