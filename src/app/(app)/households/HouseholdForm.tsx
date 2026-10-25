import Link from "next/link";
import type { Household } from "@/lib/households/repository";

export function HouseholdForm({ action, h, cancelHref }: { action: (fd: FormData) => Promise<void>; h?: Household; cancelHref: string }) {
  return (
    <form action={action} className="card" style={{ maxWidth: 720 }}>
      <div className="form-grid">
        <div className="field full"><label htmlFor="household_name">Household Name<span className="req"> *</span></label><input id="household_name" name="household_name" required maxLength={200} defaultValue={h?.householdName ?? ""} placeholder="e.g. The Mensah Family" /></div>
        <div className="field"><label htmlFor="head_of_household">Head of Household</label><input id="head_of_household" name="head_of_household" maxLength={200} defaultValue={h?.headOfHousehold ?? ""} /></div>
        <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" maxLength={100} defaultValue={h?.phone ?? ""} /></div>
        <div className="field full"><label htmlFor="address">Address</label><input id="address" name="address" maxLength={250} defaultValue={h?.address ?? ""} /></div>
        <div className="field full"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={3} defaultValue={h?.notes ?? ""} /></div>
      </div>
      <div className="form-actions"><button className="btn" type="submit">💾 Save</button><Link href={cancelHref} className="btn btn-secondary">Cancel</Link></div>
    </form>
  );
}
