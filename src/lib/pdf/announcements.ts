import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { DEJAVU_SERIF_BOLD_B64, DEJAVU_SERIF_REGULAR_B64 } from "@/lib/certificates/fonts.generated";
import { GOLD, GREY, INK, MAROON, safe } from "@/lib/certificates/pdf";
import { CATEGORIES, CLOSING_LINE, FUNERAL_PRINT_NOTE, categoryLabel } from "@/lib/announcements/categories";
import { richToBlocks, type Run } from "@/lib/announcements/sanitize";
import { formatDate } from "@/lib/dates";

export interface PrintItem { category: string; announcementDate: string; title: string; content: string }

const W = 595.28, H = 841.89, M = 56;

/**
 * The Sunday announcements sheet. Prints ONLY what is passed in (the caller supplies approved rows) and never the
 * entry timestamp or a submitter's contact details. Italic has no embedded face, so it prints upright.
 */
export async function buildAnnouncementsPdf(a: { parishName: string; start: string; end: string; categoryFilter: string; items: PrintItem[]; generatedOn: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(Buffer.from(DEJAVU_SERIF_REGULAR_B64, "base64"), { subset: true });
  const bold = await pdf.embedFont(Buffer.from(DEJAVU_SERIF_BOLD_B64, "base64"), { subset: true });
  pdf.setTitle("Announcements"); pdf.setAuthor(a.parishName); pdf.setCreator("Parish Records");

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const need = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const centre = (t: string, size: number, f: PDFFont, color = INK) => { need(size + 8); const s = safe(f, t); page.drawText(s, { x: (W - f.widthOfTextAtSize(s, size)) / 2, y: y - size, size, font: f, color }); y -= size + 8; };

  /** Wraps styled runs into lines, then draws them. */
  const paragraph = (runs: Run[], size: number, indent = 0, marker = "", gap = 5) => {
    type Word = { text: string; font: PDFFont; underline: boolean };
    const words: Word[] = [];
    for (const r of runs) {
      for (const part of r.text.split(/(\n)/)) {
        if (part === "\n") { words.push({ text: "\n", font: regular, underline: false }); continue; }
        for (const w of part.split(/\s+/).filter(Boolean)) words.push({ text: safe(r.bold ? bold : regular, w), font: r.bold ? bold : regular, underline: !!r.underline });
      }
    }
    const maxW = W - 2 * M - indent, space = regular.widthOfTextAtSize(" ", size);
    const lines: Word[][] = [[]];
    let width = 0;
    for (const w of words) {
      if (w.text === "\n") { lines.push([]); width = 0; continue; }
      const ww = w.font.widthOfTextAtSize(w.text, size);
      const cur = lines[lines.length - 1]!;
      if (cur.length && width + space + ww > maxW) { lines.push([w]); width = ww; } else { cur.push(w); width += (cur.length > 1 ? space : 0) + ww; }
    }
    lines.forEach((ln, li) => {
      need(size * 1.4);
      let x = M + indent;
      if (li === 0 && marker) page.drawText(marker, { x: M + indent - 14, y: y - size, size, font: regular, color: INK });
      ln.forEach((w, wi) => {
        if (wi) x += space;
        page.drawText(w.text, { x, y: y - size, size, font: w.font, color: INK });
        const ww = w.font.widthOfTextAtSize(w.text, size);
        if (w.underline) page.drawLine({ start: { x, y: y - size - 1.5 }, end: { x: x + ww, y: y - size - 1.5 }, thickness: 0.5, color: INK });
        x += ww;
      });
      y -= size * 1.4;
    });
    y -= gap;
  };

  centre(a.parishName, 17, bold, MAROON);
  centre("Announcements", 14, bold);
  centre(a.start === a.end ? formatDate(a.start) : `${formatDate(a.start)} – ${formatDate(a.end)}`, 10.5, regular, GREY);
  page.drawLine({ start: { x: W / 2 - 60, y: y + 2 }, end: { x: W / 2 + 60, y: y + 2 }, thickness: 1, color: GOLD });
  y -= 14;

  const cats = a.categoryFilter ? ([[a.categoryFilter, categoryLabel(a.categoryFilter)]] as [string, string][]) : (Object.entries(CATEGORIES) as [string, string][]);
  let any = false;
  for (const [cat, label] of cats) {
    const items = a.items.filter((i) => i.category === cat);
    if (!items.length) continue; // empty categories are left off the sheet
    any = true;
    need(40);
    paragraph([{ text: label.toUpperCase(), bold: true }], 12.5, 0, "", 6);
    for (const it of items) {
      paragraph([{ text: `${formatDate(it.announcementDate)} — ${it.title}`, bold: true }], 11.5, 0, "", 3);
      for (const b of richToBlocks(it.content)) b.kind === "li" ? paragraph(b.runs, 11, 20, b.marker, 2) : paragraph(b.runs, 11, 0, "", 4);
      y -= 4;
    }
    if (cat === "funeral") paragraph([{ text: FUNERAL_PRINT_NOTE }], 10, 0, "", 8);
    y -= 8;
  }
  if (!any) paragraph([{ text: "No approved announcements for this period." }], 11);
  else { y -= 6; paragraph([{ text: CLOSING_LINE, bold: true }], 12, 0, "", 6); }
  y -= 10;
  paragraph([{ text: `Generated on ${a.generatedOn}` }], 8.5);
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 22, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }));
  return pdf.save();
}
