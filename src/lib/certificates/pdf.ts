import "server-only";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { DEJAVU_SERIF_BOLD_B64, DEJAVU_SERIF_REGULAR_B64 } from "./fonts.generated";

export interface CertificateInput {
  sacrament: string; // "Holy Matrimony"
  parishName: string;
  parishAddress: string;
  /** Ordered label/value rows to print. */
  fields: [string, string][];
  /** Printed under the rows: "Issued on", signature line, reference. */
  issuedOn: string;
  reference: string;
}

// The parish palette (cardinal maroon + antique gold), as in the app.
const MAROON = rgb(0.43, 0.08, 0.14);
const GOLD = rgb(0.65, 0.47, 0.12);
const INK = rgb(0.11, 0.13, 0.19);
const GREY = rgb(0.38, 0.4, 0.45);
const RULE = rgb(0.82, 0.8, 0.74);

const W = 595.28, H = 841.89, MARGIN = 62;

/** Replace anything the embedded font cannot draw so a stray symbol never breaks the whole certificate. */
function safe(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text.replace(/[\r\n\t]+/g, " ")].map((ch) => (set.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of safe(font, text).split(/\s+/).filter(Boolean)) {
    let w = word;
    // a single over-long word is split so it can never run off the page
    while (font.widthOfTextAtSize(w, size) > maxWidth) {
      let cut = w.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
      if (line) { lines.push(line); line = ""; }
      lines.push(w.slice(0, cut)); w = w.slice(cut);
    }
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** pdf-lib has no letter-spacing option, so spaced (tracked) headings are drawn one character at a time. */
function spaced(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, color: ReturnType<typeof rgb>, spacing: number) {
  if (!spacing) { page.drawText(text, { x, y, size, font, color }); return; }
  let cx = x;
  for (const ch of text) { page.drawText(ch, { x: cx, y, size, font, color }); cx += font.widthOfTextAtSize(ch, size) + spacing; }
}

function centered(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color = INK, spacing = 0) {
  const t = safe(font, text);
  const width = font.widthOfTextAtSize(t, size) + spacing * Math.max(0, [...t].length - 1);
  spaced(page, font, t, (W - width) / 2, y, size, color, spacing);
}

function frame(page: PDFPage) {
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: MAROON, borderWidth: 2.2 });
  page.drawRectangle({ x: 33, y: 33, width: W - 66, height: H - 66, borderColor: GOLD, borderWidth: 0.8 });
}

export async function buildCertificatePdf(c: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Certificate of ${c.sacrament}`);
  pdf.setAuthor(c.parishName);
  pdf.setCreator("Parish Records");
  const regular = await pdf.embedFont(Buffer.from(DEJAVU_SERIF_REGULAR_B64, "base64"), { subset: true });
  const bold = await pdf.embedFont(Buffer.from(DEJAVU_SERIF_BOLD_B64, "base64"), { subset: true });

  let page = pdf.addPage([W, H]);
  frame(page);

  // ---- heading
  centered(page, bold, c.parishName, H - 98, 21, MAROON);
  let y = H - 98;
  if (c.parishAddress.trim()) {
    for (const line of wrap(regular, c.parishAddress, 9.5, W - 2 * MARGIN - 40)) { y -= 15; centered(page, regular, line, y, 9.5, GREY); }
  }
  y -= 22;
  page.drawLine({ start: { x: W / 2 - 60, y }, end: { x: W / 2 + 60, y }, thickness: 1.2, color: GOLD });
  y -= 36;
  centered(page, bold, `CERTIFICATE OF ${c.sacrament.toUpperCase()}`, y, 15.5, INK, 1.4);
  y -= 20;
  centered(page, regular, "Extract from the sacramental register of this parish", y, 9.5, GREY);
  y -= 34;

  // ---- label / value rows
  const labelX = MARGIN, valueX = MARGIN + 150, valueW = W - MARGIN - valueX;
  for (const [label, value] of c.fields) {
    const lines = wrap(regular, value && value.trim() ? value : "—", 11.5, valueW);
    const rowH = Math.max(1, lines.length) * 16 + 10;
    if (y - rowH < 170) { // continue on a second page rather than overflow
      page = pdf.addPage([W, H]); frame(page); y = H - 90;
    }
    spaced(page, bold, safe(bold, label.toUpperCase()), labelX, y - 12, 8.2, GREY, 0.4);
    lines.forEach((ln, i) => page.drawText(ln, { x: valueX, y: y - 12 - i * 16, size: 11.5, font: regular, color: INK }));
    y -= rowH;
    page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: W - MARGIN, y: y + 2 }, thickness: 0.4, color: RULE });
  }

  // ---- signature block (always on the last page, bottom)
  const base = 112;
  page.drawText(`Issued on ${safe(regular, c.issuedOn)}`, { x: MARGIN, y: base + 38, size: 10.5, font: regular, color: INK });
  page.drawText(safe(regular, `Certificate ref. ${c.reference}`), { x: MARGIN, y: base + 20, size: 9, font: regular, color: GREY });
  page.drawLine({ start: { x: W - MARGIN - 190, y: base + 30 }, end: { x: W - MARGIN, y: base + 30 }, thickness: 0.8, color: INK });
  const sig = "Parish Priest / Administrator";
  page.drawText(sig, { x: W - MARGIN - 190 + (190 - regular.widthOfTextAtSize(sig, 9.5)) / 2, y: base + 14, size: 9.5, font: regular, color: INK });

  return pdf.save();
}
