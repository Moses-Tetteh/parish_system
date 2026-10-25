/**
 * Marriage-preparation rules (port of MarriagePrepService.php). Pure: no database, so every rule is unit-tested.
 * The file's status is DERIVED from what has been recorded, never typed, so it cannot disagree with the checklist.
 */
export type Religion = "catholic" | "other_christian" | "non_christian" | string;

export interface PrepFacts {
  status: string; groomReligion: Religion | null; brideReligion: Religion | null;
  prenuptialInquiryDone: number | null; marriageCourseDone: number | null;
  groomBaptismCert: number | null; groomConfirmationCert: number | null; groomFreedomProof: number | null;
  brideBaptismCert: number | null; brideConfirmationCert: number | null; brideFreedomProof: number | null;
  dispensationType: string | null; dispensationStatus: string | null;
  banns1Date: string | null; banns2Date: string | null; banns3Date: string | null; bannsDispensed: number | null;
  proposedDate: string | null; approvedAt: string | null; matrimonyId: number | null;
}

export type Dispensation = "none" | "mixed_religion" | "disparity_of_cult";

/** Which permission/dispensation the couple needs, judged from the two religions. */
export function requiredDispensation(p: Pick<PrepFacts, "groomReligion" | "brideReligion">): Dispensation {
  const r = [p.groomReligion ?? "catholic", p.brideReligion ?? "catholic"];
  const catholics = r.filter((x) => x === "catholic").length;
  if (catholics === 2 || catholics === 0) return "none"; // both Catholic: none needed; neither: not a Catholic-form marriage (flagged elsewhere)
  const other = r[0] === "catholic" ? r[1] : r[0];
  return other === "other_christian" ? "mixed_religion" : "disparity_of_cult";
}

export interface ChecklistItem { label: string; done: boolean; required: boolean }

export function checklist(p: PrepFacts): ChecklistItem[] {
  const needBaptismCert = (rel: string) => rel === "catholic" || rel === "other_christian";
  const needConfirmation = (rel: string) => rel === "catholic";
  const items: ChecklistItem[] = [
    { label: "Pre-nuptial inquiry completed", done: !!p.prenuptialInquiryDone, required: true },
    { label: "Marriage preparation course completed", done: !!p.marriageCourseDone, required: true },
  ];
  for (const [who, rel, bap, conf, free] of [
    ["Groom", p.groomReligion ?? "catholic", p.groomBaptismCert, p.groomConfirmationCert, p.groomFreedomProof],
    ["Bride", p.brideReligion ?? "catholic", p.brideBaptismCert, p.brideConfirmationCert, p.brideFreedomProof],
  ] as const) {
    items.push({ label: `${who}: recent baptismal certificate`, done: !!bap, required: needBaptismCert(rel) });
    items.push({ label: `${who}: confirmation certificate`, done: !!conf, required: needConfirmation(rel) });
    items.push({ label: `${who}: proof of freedom to marry`, done: !!free, required: true });
  }
  return items;
}

export const bannsDates = (p: Pick<PrepFacts, "banns1Date" | "banns2Date" | "banns3Date">): string[] =>
  [p.banns1Date, p.banns2Date, p.banns3Date].filter((d): d is string => !!d);

/** Everything standing between this file and the priest's approval (empty = ready). */
export function approvalBlockers(p: PrepFacts): string[] {
  const b: string[] = [];
  for (const i of checklist(p)) if (i.required && !i.done) b.push(`Missing: ${i.label}`);
  const needed = requiredDispensation(p);
  if (needed !== "none" && (p.dispensationStatus ?? "not_needed") !== "granted") {
    b.push(`${needed === "mixed_religion" ? "Permission for a mixed marriage" : "Dispensation from disparity of cult"} has not been granted yet.`);
  } else if ((p.dispensationType ?? "none") !== "none" && p.dispensationStatus !== "granted") {
    b.push("The recorded dispensation has not been granted yet.");
  }
  if (!p.bannsDispensed && bannsDates(p).length < 3) b.push("Banns have not been published three times (or dispensed by the Ordinary).");
  else if (!p.bannsDispensed && p.proposedDate && p.banns3Date && p.banns3Date >= p.proposedDate) b.push("The third publication of banns must come before the wedding date.");
  if (!p.proposedDate) b.push("No wedding date has been proposed.");
  return b;
}

export type PrepStatus = "inquiry" | "documents" | "banns" | "approved" | "married" | "cancelled";

export function deriveStatus(p: PrepFacts): PrepStatus {
  if (p.status === "cancelled") return "cancelled";
  if (p.matrimonyId) return "married";
  if (p.approvedAt) return "approved";
  if (p.banns1Date || p.bannsDispensed) return "banns";
  if (p.prenuptialInquiryDone) return "documents";
  return "inquiry";
}

const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

/** Banns must be in order (hard error) and are normally on Sundays (soft warning). */
export function bannsCheck(d: { banns1Date?: string | null; banns2Date?: string | null; banns3Date?: string | null }): { error?: string; warnings: string[] } {
  const dates: Record<number, string> = {};
  const warnings: string[] = [];
  ([1, 2, 3] as const).forEach((n) => {
    const v = d[`banns${n}Date` as const];
    if (v) { dates[n] = v; if (!isSunday(v)) warnings.push(`Banns #${n} (${v}) is not a Sunday — banns are normally published on Sundays or holy days.`); }
  });
  let prev: string | null = null;
  for (const n of [1, 2, 3]) {
    const v = dates[n];
    if (v === undefined) continue;
    if (prev !== null && v <= prev) return { error: "Banns dates must be in order: 1st before 2nd before 3rd.", warnings };
    prev = v;
  }
  if ((dates[2] && !dates[1]) || (dates[3] && !dates[2])) return { error: "Fill the banns dates in order — 1st, then 2nd, then 3rd.", warnings };
  return { warnings };
}

/** "Mary Ama Mensah" -> ["Mary Ama", "Mensah"] (surname is the last word). */
export function splitName(full: string): [given: string, surname: string] {
  const s = full.replace(/\s+/g, " ").trim();
  const i = s.lastIndexOf(" ");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

export const BANNS_LABELS = { 1: "1st", 2: "2nd", 3: "3rd" } as const;

/** The announcement text for one publication (names are inserted by the caller already HTML-escaped). */
export function bannsAnnouncement(n: 1 | 2 | 3, groom: string, groomFrom: string | null, bride: string, brideFrom: string | null): { title: string; html: string } {
  const label = BANNS_LABELS[n];
  return {
    title: `Banns of Marriage — ${label} Publication`,
    html: `<p>${groom}${groomFrom ? ` of ${groomFrom}` : ""} and ${bride}${brideFrom ? ` of ${brideFrom}` : ""} intend to enter into Holy Matrimony. This is the ${label} publication of the banns. Anyone who knows of any impediment to this marriage is bound in conscience to inform the Parish Priest.</p>`,
  };
}
