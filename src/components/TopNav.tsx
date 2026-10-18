"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NavIcon } from "@/components/icons";
import type { NavGroup, NavTopItem } from "@/lib/nav";

interface Props {
  top: NavTopItem[];
  groups: NavGroup[];
  user: { name: string; initial: string; roleLabel: string; canManageUsers: boolean };
  logoutAction: () => Promise<void>;
}

/**
 * The PHP app's maroon top bar (includes/header.php): brand + user chip on the first row,
 * primary nav with grouped dropdowns on the second. Click opens a group, click elsewhere or
 * Esc closes it; below 980px the whole nav collapses behind the hamburger.
 */
export function TopNav({ top, groups, user, logoutAction }: Props) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close everything after a navigation.
  useEffect(() => { setNavOpen(false); setOpenGroup(null); setUserOpen(false); }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!navRef.current?.contains(t)) setOpenGroup(null);
      if (!userRef.current?.contains(t)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenGroup(null); setUserOpen(false); } };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="topbar">
      <div className="topbar-main">
        <Link href="/dashboard" className="brand" style={{ textDecoration: "none" }}>
          <span className="brand-seal"><img src="/assets/images/logo.png" alt="Blessed Clementina Catholic Church seal" width={38} height={38} /></span>
          <span className="brand-text">
            <span className="name">Blessed Clementina</span>
            <span className="subtitle">Sacraments Register</span>
          </span>
        </Link>

        <div className="topbar-actions">
          <button type="button" className={`nav-toggle${navOpen ? " open" : ""}`} aria-expanded={navOpen} aria-controls="primaryNav" aria-label="Toggle navigation menu" onClick={() => setNavOpen((o) => !o)}>
            <span /><span /><span />
          </button>

          <div className={`user-menu${userOpen ? " open" : ""}`} ref={userRef}>
            <button type="button" className="user-chip" aria-haspopup="true" aria-expanded={userOpen} onClick={() => setUserOpen((o) => !o)}>
              <span className="user-avatar">{user.initial}</span>
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{user.roleLabel}</span>
              </span>
              <NavIcon name="chevron" size={14} className="chevron" />
            </button>
            <div className="user-dropdown" role="menu">
              <Link href="/account/password" role="menuitem"><NavIcon name="lock" size={16} className="" />Change Password</Link>
              {user.canManageUsers && <Link href="/admin/users" role="menuitem"><NavIcon name="users" size={16} className="" />Manage Users</Link>}
              <div className="dropdown-divider" />
              <form action={logoutAction}>
                <button type="submit" className="logout-btn" role="menuitem"><NavIcon name="logout" size={16} className="" />Log out</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <nav className={`nav${navOpen ? " open" : ""}`} id="primaryNav" aria-label="Main" ref={navRef}>
        {top.map((i) => (
          <Link key={i.href} href={i.href} className={isActive(i.href) ? "active" : ""} aria-current={isActive(i.href) ? "page" : undefined}>
            <NavIcon name={i.icon} />
            <span className="nav-label">{i.label}</span>
          </Link>
        ))}
        {groups.map((g) => {
          const open = openGroup === g.label;
          const hasActive = g.items.some((i) => isActive(i.href));
          return (
            <div key={g.label} className={`nav-group${open ? " open" : ""}${hasActive ? " has-active" : ""}`}>
              <button type="button" className="nav-group-btn" aria-expanded={open} aria-haspopup="true" onClick={(e) => { e.stopPropagation(); setOpenGroup(open ? null : g.label); }}>
                <NavIcon name={g.icon} />
                <span className="nav-label">{g.label}</span>
                <NavIcon name="chevron" />
              </button>
              <div className="nav-menu" role="menu">
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} role="menuitem" className={isActive(i.href) ? "active" : ""}>{i.label}</Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </header>
  );
}
