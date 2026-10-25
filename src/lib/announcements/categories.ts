/** The nine categories the office uses, in the fixed order they are always printed (port of includes/announcement_categories.php). */
export const CATEGORIES = {
  liturgy_schedule: "Liturgy Schedule",
  weekday_masses: "Weekday Masses",
  general_meetings: "General Meetings",
  meetings: "Meetings",
  funeral: "Funeral",
  other_blessings: "Other Blessings",
  notice: "Notice",
  publication_of_banns: "Publication of Banns",
  health_tips: "Health Tips for the Week",
} as const;
export type Category = keyof typeof CATEGORIES;

/** Still valid to load / filter / edit (old data) but no longer offered for new entries. */
export const LEGACY_CATEGORIES = { general: "General (legacy)" } as const;
export const ALL_CATEGORY_LABELS: Record<string, string> = { ...CATEGORIES, ...LEGACY_CATEGORIES };

export const isCategory = (v: string): boolean => v in ALL_CATEGORY_LABELS;
export const categoryLabel = (c: string): string => ALL_CATEGORY_LABELS[c] ?? c.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());

const PALETTE = [
  { background: "#eaf0f4", color: "#2c5f7c" }, { background: "#efe9f6", color: "#5b3a8a" }, { background: "#eaf4ee", color: "#1f7a4d" },
  { background: "#fbf1de", color: "#8a6100" }, { background: "#efe6e6", color: "#6b3a3a" }, { background: "#e6f2f4", color: "#2b6f79" },
  { background: "#f3ecec", color: "#7a3b57" }, { background: "#eef2e6", color: "#4a6b1f" }, { background: "#eeeaf9", color: "#4b3f8a" },
];
export function categoryBadge(c: string): { background: string; color: string } {
  const i = Object.keys(CATEGORIES).indexOf(c);
  return i < 0 ? { background: "#eee", color: "#555" } : PALETTE[i % PALETTE.length]!;
}

export const FUNERAL_PRINT_NOTE =
  "We kindly ask the faithful to remember the deceased and their families in their prayers and where possible, join in the funeral rites.\n" +
  "May the souls of the faithful departed, through the mercy of God, rest in peace.";
export const CLOSING_LINE = "Thank you all for your kind attention. May God bless you.";

/** The coming Sunday (today if it is Sunday) — the default print range. */
export function nextSunday(todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
