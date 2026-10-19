"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/registers/repository";
import { MAX_COLS, MAX_ROWS, SpreadsheetError, parseSpreadsheet } from "@/lib/import/spreadsheet";
import { buildPreview, commitWindow, type CommitResult } from "@/lib/import/marriage-import";

export interface ReadState { error?: string; sheet?: { fileName: string; rows: string[][]; truncated: boolean } }

export async function readSheetAction(_prev: ReadState, fd: FormData): Promise<ReadState> {
  await requirePermission("registers");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel (.xlsx) or CSV file first." };
  try {
    const parsed = await parseSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));
    if (parsed.rows.length === 0 || parsed.rows.every((r) => r.every((c) => c === ""))) return { error: "That file has no data." };
    return { sheet: { fileName: file.name.slice(0, 120), rows: parsed.rows, truncated: parsed.truncated } };
  } catch (e) {
    if (e instanceof SpreadsheetError) return { error: e.message };
    console.error("readSheet failed", e);
    return { error: "Could not read that file." };
  }
}

// The browser sends the sheet back with every step (no server-side upload storage on serverless).
// Treat it as UNTRUSTED input: shape and size are validated; every value is re-validated by the import engine.
const inputSchema = z.object({
  rows: z.array(z.array(z.string().max(2000)).max(MAX_COLS)).max(MAX_ROWS),
  hasHeader: z.boolean(),
  layout: z.enum(["combined", "paired"]),
  mapping: z.record(z.string().max(60), z.number().int().min(0).max(MAX_COLS).nullable()),
});

export interface PreviewRow { rowNumber: number; status: "ready" | "error" | "duplicate"; errors: string[]; warnings: string[]; summary: { recordNo: string; groom: string; bride: string; date: string } }
export interface PreviewView { results: PreviewRow[]; notes: string[]; counts: { ready: number; error: number; duplicate: number } }

export async function previewImportAction(raw: unknown): Promise<PreviewView | { error: string }> {
  const user = await requirePermission("registers");
  const input = inputSchema.safeParse(raw);
  if (!input.success) return { error: "The file data was not valid. Please upload it again." };
  try {
    const p = await buildPreview(user, input.data);
    return { counts: p.counts, notes: p.notes, results: p.results.map(({ data: _data, ...rest }) => rest) }; // typed values stay on the server
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "You do not have permission to import." };
    console.error("preview failed", e);
    return { error: "Could not check the file. Please try again." };
  }
}

export async function commitImportAction(raw: unknown, offset: number, limit: number): Promise<CommitResult | { error: string }> {
  const user = await requirePermission("registers");
  const input = inputSchema.safeParse(raw);
  const bounds = z.object({ offset: z.number().int().min(0), limit: z.number().int().min(1).max(25) }).safeParse({ offset, limit });
  if (!input.success || !bounds.success) return { error: "The file data was not valid. Please upload it again." };
  try {
    return await commitWindow(user, input.data, bounds.data.offset, bounds.data.limit);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "You do not have permission to import." };
    console.error("commit failed", e);
    return { error: "Something went wrong while saving. Nothing is lost: run the import again and finished rows are skipped." };
  }
}
