/**
 * Hand-drawn line icons, ported 1:1 from the PHP app (includes/header.php `$navIcons`
 * and includes/icons.php `icon()`). No icon library, no network request; every icon uses
 * stroke="currentColor" so it inherits its colour from CSS.
 */
import type { ReactNode } from "react";

const NAV_PATHS: Record<string, ReactNode> = {
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  circle: <circle cx="12" cy="12" r="8" />,
  flame: <path d="M12 2c1.5 3-2 4-2 7a4 4 0 0 0 8 0c0-1.5-1-2.5-1-2.5s2 1.5 2 5a7 7 0 1 1-14 0c0-4.5 4-6 4-6s.5 1.5 3-3.5z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.6 3-5.5 7-5.5s7 1.9 7 5.5" /><path d="M16 8a3 3 0 1 1 5.2 2M17.5 14.6c2.6.5 4.5 2 4.5 5.4" /></>,
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9.5a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" /></>,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M14.5 8.3a6 6 0 1 1 0 10.4" /></>,
  message: <path d="M21 11.5a8.4 8.4 0 0 1-4.9 7.6 8.5 8.5 0 0 1-3.8.9 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.5A8.4 8.4 0 0 1 4 12.5a8.5 8.5 0 0 1 8.5-8.5h.3A8.5 8.5 0 0 1 21 11.2z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7v.2a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1.2-1.7 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1.1H2a2 2 0 1 1 0-4h.1A1.8 1.8 0 0 0 3.8 9a1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4H8.3A1.8 1.8 0 0 0 9.4 2.8V2.7a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2v.1c.2.8.9 1.4 1.7 1.4h.2a2 2 0 1 1 0 4h-.1a1.8 1.8 0 0 0-1.7 1.1z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  megaphone: <><path d="M3 10v4a1 1 0 0 0 1 1h2l1 5h2l-1-5h2l9 4V6l-9 4H4a1 1 0 0 0-1 1z" /><path d="M18 9a4 4 0 0 1 0 6" /></>,
  lock: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
};

export type NavIconName = keyof typeof NAV_PATHS;

export function NavIcon({ name, size = 16, className = "nav-icon" }: { name: string; size?: number; className?: string }) {
  // width/height are set on the element itself so an icon can never balloon to the
  // browser's 300x150 default box if the stylesheet is late or stale (same as the PHP app).
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_PATHS[name] ?? NAV_PATHS.circle}
    </svg>
  );
}

const SAC_PATHS: Record<string, ReactNode> = {
  baptism: <path d="M12 2.5c3.2 4.2 6 8.1 6 11.5a6 6 0 1 1-12 0c0-3.4 2.8-7.3 6-11.5Z" />,
  communion: <><circle cx="12" cy="6" r="2.6" /><path d="M6 11c0 2.8 2.7 4.5 6 4.5s6-1.7 6-4.5" /><path d="M12 15.5V20" /><path d="M8 20h8" /></>,
  confirmation: <path d="M3 12c2.5-3.5 6-4 8-2.5 1-2 3.5-3.5 6-2.8-1 1.8-1 3-.3 4.3 1 .3 2 .2 3.3-.5-1.6 2.7-4.6 4-7 3.5-.5 2-2.3 3.5-4 3.5-.3-1.4.2-2.6 1-3.3-2.7.1-5.3-.7-7-2.2Z" />,
  matrimony: <><circle cx="9" cy="13" r="4.3" /><circle cx="15" cy="13" r="4.3" /></>,
  death: <path d="M12 3v18M7 8h10" />,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
};

/** Sacrament / feature icon (PHP `icon()`): 1.6 stroke, used on dashboard stat cards. */
export function SacIcon({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SAC_PATHS[name] ?? null}
    </svg>
  );
}

/** The signature rosary-dot divider. */
export function RosaryDivider({ count = 7, style }: { count?: number; style?: React.CSSProperties }) {
  return (
    <div className="rosary-divider" style={style} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <span key={i} />)}
    </div>
  );
}
