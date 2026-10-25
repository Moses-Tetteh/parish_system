"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AnnouncementTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (h: string) => (h === "/announcements" ? path === h || path.startsWith("/announcements/new") || /^\/announcements\/\d+/.test(path) : path.startsWith(h));
  return (
    <nav className="subnav no-print" aria-label="Announcements">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={active(t.href) ? "active" : ""} aria-current={active(t.href) ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}
