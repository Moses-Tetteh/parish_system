/**
 * Rules for deciding whether two register entries could be the same person (port of PersonNameMatcher.php).
 * Pure functions: no database, no session, unit-tested on their own.
 *
 * Registers write names in different orders ("Mary Ama Mensah" / "Mensah Mary Ama"), with stray punctuation,
 * titles or accents, so matching works on a NAME KEY: lower-case, accents folded, titles and punctuation
 * removed, words sorted. Deliberately conservative: when in doubt keep two people apart and flag them for
 * review. A wrong merge hides a person; a duplicate is visible and fixable.
 */

/** Honorifics only. Deliberately SHORT: "Nana" is a real given name and "Jnr"/"Snr" tell a father from his son. */
const TITLES = new Set(["mr", "mrs", "miss", "ms", "dr", "rev", "fr", "br", "hon"]);

const FOLD: Record<string, string> = {
  á: "a", à: "a", â: "a", ä: "a", ã: "a", å: "a",
  é: "e", è: "e", ê: "e", ë: "e", ɛ: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", ö: "o", õ: "o", ɔ: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n", ŋ: "n",
};

/** Normalised, de-duplicated name words (order preserved). */
export function tokens(name: string | null | undefined): string[] {
  let s = (name ?? "").trim().toLowerCase();
  if (!s) return [];
  s = s.replace(/[\u00e0-\u00ff\u0254\u025b\u014b]/g, (c) => FOLD[c] ?? c);
  s = s.replace(/['’]/g, ""); // O'Brien -> obrien, not "o" + "brien"
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  const words = s.split(/\s+/u).filter(Boolean).filter((w) => !TITLES.has(w));
  return [...new Set(words)];
}

/** Order-independent key; "" when the name has no usable words. */
export function nameKey(name: string | null | undefined): string {
  return [...tokens(name)].sort().join(" ").slice(0, 250);
}

/** Same words, any order. Needs two or more words so "Mary" alone never matches "Mary". */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = nameKey(a);
  return ka !== "" && tokens(a).length >= 2 && ka === nameKey(b);
}

const subsetOf = (short: string[], long: string[]) => short.every((w) => long.includes(w));

/** One name is an abbreviation of the other ("Mary Mensah" / "Mary Ama Mensah"). Used only to FLAG, never to merge. */
export function looksLikeSamePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  return ta.length <= tb.length ? subsetOf(ta, tb) : subsetOf(tb, ta);
}

/** Recorded parent names do not contradict each other. A blank on either side is "no information". */
export function parentsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return true;
  return ta.length <= tb.length ? subsetOf(ta, tb) : subsetOf(tb, ta);
}

/** Birth years within two years of each other (registers round and mistype); unknown never conflicts. */
export function birthYearsCompatible(a: number | null | undefined, b: number | null | undefined): boolean {
  return a == null || b == null || Math.abs(a - b) <= 2;
}
