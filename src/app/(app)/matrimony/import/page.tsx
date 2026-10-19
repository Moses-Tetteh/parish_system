import Link from "next/link";
import { MarriageImportWizard } from "@/components/MarriageImportWizard";
import { requirePermission } from "@/lib/auth/session";
import { mappingFieldsFor } from "@/lib/import/marriage-import";
import { readSheetAction, previewImportAction, commitImportAction } from "./actions";

export const metadata = { title: "Import Holy Matrimony Records" };
export const dynamic = "force-dynamic";
export const maxDuration = 60; // each save step handles a small window of rows, but allow for a slow database

export default async function ImportMarriages() {
  await requirePermission("registers");
  return (
    <>
      <h1>Import Holy Matrimony Records</h1>
      <p className="hint">Upload an Excel (.xlsx) or CSV file. You choose which column holds what, check the result, and only then are records added. Nothing is saved until you confirm.</p>
      <p><Link href="/matrimony" className="btn btn-secondary">← Back to the register</Link></p>
      <MarriageImportWizard
        readAction={readSheetAction}
        previewAction={previewImportAction}
        commitAction={commitImportAction}
        combinedFields={mappingFieldsFor("combined")}
        pairedFields={mappingFieldsFor("paired")}
      />
    </>
  );
}
