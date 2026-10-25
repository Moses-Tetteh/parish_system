import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requirePermission } from "@/lib/auth/session";
import { allSettings } from "@/lib/settings-admin/repository";
import type { SP } from "@/lib/forms";
import { saveAnnouncementsAction, saveIdentityAction } from "./actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("settings.manage");
  const s = await allSettings(user);
  return (
    <>
      <h1>Settings</h1>
      <Notice sp={await searchParams} />
      <div className="card"><h2>Users &amp; Access</h2><p className="muted">Add accounts, reset passwords and deactivate access.</p><Link href="/admin/users" className="btn btn-small">Manage Users</Link></div>
      <div className="card"><h2>Workflow rules</h2><p className="muted">Certificate sign-off, sponsor age, class attendance and the liturgical calendar options.</p><Link href="/admin/settings/workflow" className="btn btn-small">Workflow Settings</Link> <Link href="/admin/settings/system-check" className="btn btn-small btn-secondary">System Check</Link></div>

      <div className="card">
        <h2>Parish Identity</h2>
        <form action={saveIdentityAction}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="parish_name">Parish name</label><input id="parish_name" name="parish_name" maxLength={150} defaultValue={s.parish_name ?? "Blessed Clementina Parish"} /></div>
            <div className="field full"><label htmlFor="parish_address">Parish address</label><textarea id="parish_address" name="parish_address" rows={2} maxLength={300} defaultValue={s.parish_address ?? ""} placeholder="e.g. P.O. Box 123, Ashaiman, Greater Accra, Ghana" /></div>
            <div className="field full"><label htmlFor="parish_slogan">Parish slogan</label><textarea id="parish_slogan" name="parish_slogan" rows={4} maxLength={400} defaultValue={s.parish_slogan ?? ""} placeholder={"One line per line, e.g.\nBlessed\nClementina"} /></div>
          </div>
          <p className="hint">The name appears on every certificate, voucher and printed sheet; the address on generated certificates.</p>
          <button className="btn" type="submit">Save Parish Identity</button>
        </form>
      </div>

      <div className="card">
        <h2>Announcements — Google Form Sync</h2>
        <p className="muted">Lets parishioners submit announcements through a Google Form, synced into Announcements as items awaiting review. Use the sheet’s <em>File → Share → Publish to web → CSV</em> link.</p>
        <form action={saveAnnouncementsAction}>
          <div className="field"><label htmlFor="announcements_google_form_csv_url">Published CSV URL</label>
            <input id="announcements_google_form_csv_url" type="url" name="announcements_google_form_csv_url" maxLength={500} defaultValue={s.announcements_google_form_csv_url ?? ""} placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" />
            <p className="field-hint">Only https://docs.google.com addresses are accepted; the server fetches this link.</p></div>
          <button className="btn" type="submit">Save</button>
        </form>
      </div>
    </>
  );
}
