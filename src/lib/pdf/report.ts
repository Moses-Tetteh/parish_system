import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { DEJAVU_SERIF_BOLD_B64, DEJAVU_SERIF_REGULAR_B64 } from "@/lib/certificates/fonts.generated";
import { GOLD, GREY, INK, MAROON, RULE, safe, wrap } from "@/lib/certificates/pdf";

/** Generic paginated table report (transactions, ledger, statement, budget) in the parish palette. */
export interface ReportColumn { header: string; weight: number; align?: "left" | "right" }
export interface ReportRow { cells: string[]; bold?: boolean; shade?: boolean }
export interface ReportInput {
  parishName: string;
  title: string;
  subtitle?: string[];
  columns: ReportColumn[];
  rows: ReportRow[];
  landscape?: boolean;
  footerNote?: string;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 40;

async function fonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  return {
    regular: await pdf.embedFont(Buffer.from(DEJAVU_SERIF_REGULAR_B64, "base64"), { subset: true }),
    bold: await pdf.embedFont(Buffer.from(DEJAVU_SERIF_BOLD_B64, "base64"), { subset: true }),
  };
}

export async function buildReportPdf(r: ReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await fonts(pdf);
  pdf.setTitle(r.title); pdf.setAuthor(r.parishName); pdf.setCreator("Parish Records");
  const W = r.landscape ? A4.h : A4.w, H = r.landscape ? A4.w : A4.h;
  const usable = W - 2 * MARGIN;
  const totalWeight = r.columns.reduce((s, c) => s + c.weight, 0);
  const widths = r.columns.map((c) => (c.weight / totalWeight) * usable);
  const size = 8.5, lineH = 11.5, pad = 4;

  const pages: PDFPage[] = [];
  const newPage = () => { const p = pdf.addPage([W, H]); pages.push(p); return p; };
  const header = (page: PDFPage, first: boolean): number => {
    let y = H - MARGIN;
    if (first) {
      page.drawText(safe(bold, r.parishName), { x: MARGIN, y: y - 12, size: 13, font: bold, color: MAROON });
      page.drawText(safe(bold, r.title), { x: MARGIN, y: y - 30, size: 11, font: bold, color: INK });
      y -= 44;
      for (const s of r.subtitle ?? []) { page.drawText(safe(regular, s), { x: MARGIN, y: y - 10, size: 8.5, font: regular, color: GREY }); y -= 12; }
      page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: W - MARGIN, y: y - 4 }, thickness: 1, color: GOLD });
      y -= 12;
    } else y -= 4;
    // column header band
    page.drawRectangle({ x: MARGIN, y: y - 16, width: usable, height: 16, color: rgb(0.43, 0.08, 0.14) });
    let x = MARGIN;
    r.columns.forEach((c, i) => {
      const t = safe(bold, c.header);
      const tw = bold.widthOfTextAtSize(t, size);
      page.drawText(t, { x: c.align === "right" ? x + widths[i]! - pad - tw : x + pad, y: y - 12, size, font: bold, color: rgb(1, 1, 1) });
      x += widths[i]!;
    });
    return y - 18;
  };

  let page = newPage();
  let y = header(page, true);
  for (const row of r.rows) {
    const font: PDFFont = row.bold ? bold : regular;
    const cellLines = row.cells.map((c, i) => wrap(font, c || "", size, widths[i]! - 2 * pad));
    const h = Math.max(...cellLines.map((l) => l.length)) * lineH + 4;
    if (y - h < MARGIN + 18) { page = newPage(); y = header(page, false); }
    if (row.shade) page.drawRectangle({ x: MARGIN, y: y - h + 2, width: usable, height: h, color: rgb(0.96, 0.94, 0.9) });
    let x = MARGIN;
    cellLines.forEach((lines, i) => {
      lines.forEach((ln, li) => {
        const tw = font.widthOfTextAtSize(ln, size);
        page.drawText(ln, { x: r.columns[i]!.align === "right" ? x + widths[i]! - pad - tw : x + pad, y: y - 9 - li * lineH, size, font, color: INK });
      });
      x += widths[i]!;
    });
    y -= h;
    page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: W - MARGIN, y: y + 2 }, thickness: 0.3, color: RULE });
  }
  if (r.footerNote) {
    if (y - 30 < MARGIN) { page = newPage(); y = H - MARGIN; }
    page.drawText(safe(regular, r.footerNote), { x: MARGIN, y: y - 18, size: 8, font: regular, color: GREY });
  }
  const total = pages.length;
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${total}`, { x: W - MARGIN - 50, y: 20, size: 8, font: regular, color: GREY }));
  return pdf.save();
}

export interface VoucherInput {
  parishName: string; isIncome: boolean; costCenter: string; date: string; account: string; pvNo: string;
  method: string; invoiceDate: string; description: string; amount: string; amountInWords: string;
  preparedBy: string; receivedBy: string; receivedDate: string; generatedOn: string;
}

export async function buildVoucherPdf(v: VoucherInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await fonts(pdf);
  pdf.setTitle(v.isIncome ? "Receipt Voucher" : "Payment Voucher"); pdf.setAuthor(v.parishName); pdf.setCreator("Parish Records");
  const page = pdf.addPage([A4.w, A4.h]);
  const m = 56, w = A4.w - 2 * m;
  let y = A4.h - m;
  const centre = (t: string, size: number, f: PDFFont, color = INK) => { const s = safe(f, t); page.drawText(s, { x: (A4.w - f.widthOfTextAtSize(s, size)) / 2, y, size, font: f, color }); };
  centre(v.parishName, 16, bold, MAROON); y -= 22;
  centre(v.isIncome ? "Receipt Voucher" : "Payment Voucher", 13, bold); y -= 28;

  const row = (label: string, value: string, labelW = 150) => {
    const lines = wrap(regular, value || "—", 10, w - labelW - 16);
    const h = lines.length * 14 + 10;
    page.drawRectangle({ x: m, y: y - h, width: labelW, height: h, borderColor: RULE, borderWidth: 0.6, color: rgb(0.97, 0.97, 0.97) });
    page.drawRectangle({ x: m + labelW, y: y - h, width: w - labelW, height: h, borderColor: RULE, borderWidth: 0.6 });
    page.drawText(safe(bold, label), { x: m + 8, y: y - 15, size: 9, font: bold, color: INK });
    lines.forEach((ln, i) => page.drawText(ln, { x: m + labelW + 8, y: y - 15 - i * 14, size: 10, font: regular, color: INK }));
    y -= h;
  };
  row("Cost Center Account", v.costCenter); row("Date", v.date); row("General Ledger Account", v.account);
  row("Type", v.isIncome ? "Income" : "Expense"); row("P.V. No.", v.pvNo); row("Cash / Cheque", v.method); row("Invoice Date", v.invoiceDate);
  y -= 18; page.drawText("Detail of Payment", { x: m, y, size: 11, font: bold, color: INK }); y -= 8;
  const dl = wrap(regular, v.description || "(no description given)", 10, w - 16); const dh = Math.max(40, dl.length * 14 + 12);
  page.drawRectangle({ x: m, y: y - dh, width: w, height: dh, borderColor: RULE, borderWidth: 0.6 });
  dl.forEach((ln, i) => page.drawText(ln, { x: m + 8, y: y - 16 - i * 14, size: 10, font: regular, color: INK }));
  y -= dh + 14;
  row("Amount", v.amount, 150); row("Amount in Words", v.amountInWords, 150);
  y -= 34;
  const sig = (t: string) => { page.drawText(safe(regular, t), { x: m, y, size: 10, font: regular, color: INK }); page.drawLine({ start: { x: m, y: y - 5 }, end: { x: m + 380, y: y - 5 }, thickness: 0.4, color: GREY }); y -= 30; };
  sig("Approved by: ______________________    Date: __________");
  sig(`Prepared by: ${v.preparedBy || "______________________"}`);
  sig(`Received by: ${v.receivedBy || "______________________"}    Date: ${v.receivedDate || "__________"}`);
  page.drawText(safe(regular, `Generated on ${v.generatedOn}`), { x: m, y: 30, size: 8, font: regular, color: GREY });
  return pdf.save();
}
