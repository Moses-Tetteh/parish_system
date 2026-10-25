import sanitizeHtml from "sanitize-html";

/**
 * Announcement text is rich (bold / italic / underline / lists) and may come from a parishioner's public form,
 * so it is reduced to an allow-list with every attribute stripped — no scripts, links, images or styles survive.
 * Safe to call repeatedly (idempotent): used at save time AND again at render time (defence in depth).
 */
const ALLOWED = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "div"];

const HAS_ALLOWED_TAG = new RegExp(`</?(${ALLOWED.join("|")})\\b`, "i");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

export function sanitizeRich(input: string | null | undefined): string {
  const html = (input ?? "").trim();
  if (!html) return "";
  // No allowed tag => plain text (old data, or a Google Form answer, even one with a stray "<"): escape it and keep the line breaks.
  if (!HAS_ALLOWED_TAG.test(html)) return `<p>${esc(html).replace(/\r\n|\r|\n/g, "<br>")}</p>`;
  const out = sanitizeHtml(html, { allowedTags: ALLOWED, allowedAttributes: {}, disallowedTagsMode: "discard", parser: { decodeEntities: true } });
  return out.replace(/(<p><\/p>\s*){3,}/g, "<p></p><p></p>").trim();
}

export const richToText = (html: string): string =>
  sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").trim();

/* ---- sanitized HTML -> blocks for the PDF ---------------------------------------------------- */

export interface Run { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
export type Block = { kind: "p"; runs: Run[] } | { kind: "li"; runs: Run[]; marker: string };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");

/**
 * Walks already-sanitized HTML (a tiny, attribute-free grammar) into paragraph / list-item blocks of styled runs.
 * It only ever sees output of sanitizeRich(), so a simple tag tokenizer is sufficient.
 */
export function richToBlocks(rawHtml: string): Block[] {
  const html = sanitizeRich(rawHtml);
  const blocks: Block[] = [];
  let runs: Run[] = [];
  const style = { bold: 0, italic: 0, underline: 0 };
  const lists: { ordered: boolean; n: number }[] = [];
  let marker = "";
  const flush = (asItem: boolean) => {
    const meaningful = runs.some((r) => r.text.trim());
    if (meaningful) blocks.push(asItem ? { kind: "li", runs, marker } : { kind: "p", runs });
    runs = [];
  };
  for (const tok of html.split(/(<\/?[a-z]+\s*\/?>)/i)) {
    if (!tok) continue;
    const m = /^<(\/?)([a-z]+)\s*\/?>$/i.exec(tok);
    if (!m) { runs.push({ text: decode(tok), bold: !!style.bold, italic: !!style.italic, underline: !!style.underline }); continue; }
    const close = m[1] === "/", tag = m[2]!.toLowerCase();
    if (tag === "b" || tag === "strong") style.bold += close ? -1 : 1;
    else if (tag === "i" || tag === "em") style.italic += close ? -1 : 1;
    else if (tag === "u") style.underline += close ? -1 : 1;
    else if (tag === "br") runs.push({ text: "\n" });
    else if (tag === "ul" || tag === "ol") { flush(false); if (close) lists.pop(); else lists.push({ ordered: tag === "ol", n: 0 }); }
    else if (tag === "li") {
      if (close) flush(true);
      else { flush(false); const l = lists[lists.length - 1]; if (l) l.n++; marker = l?.ordered ? `${l.n}.` : "•"; }
    } else if (tag === "p" || tag === "div") flush(false);
  }
  flush(false);
  for (const k of Object.keys(style) as (keyof typeof style)[]) style[k] = Math.max(0, style[k]);
  return blocks;
}
