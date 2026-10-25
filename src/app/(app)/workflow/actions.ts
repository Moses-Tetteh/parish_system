"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getRegister } from "@/lib/registers/registry";
import { back, checked, dateOf, intOf, oneOf, optStr, str } from "@/lib/forms";
import { PrepError, PrepForbiddenError, approve, cancelOrReopen, convertToMatrimony, withdrawApproval } from "@/lib/marriage-prep/service";
import { CandidateError, CandidateForbiddenError, activeCandidatesFor, addSponsor, deleteSponsor, overrideSponsor, promote, recordSession, withdrawCandidate } from "@/lib/candidates/service";

const PROGRAM_KEYS = Object.keys(getRegister("candidates")?.fields.find((f) => f.key === "program")?.options ?? {});

function msg(e: unknown, fallback: string): string {
  if (e instanceof PrepForbiddenError || e instanceof CandidateForbiddenError) redirect("/forbidden");
  if (e instanceof PrepError || e instanceof CandidateError) return e.message;
  console.error("workflow action failed", e);
  return fallback;
}

export async function prepAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = intOf(fd, "id"), act = str(fd, "do", 20);
  if (!id) redirect("/registers/marriage_prep");
  const here = `/registers/marriage_prep/${id}`;
  try {
    switch (act) {
      case "approve": await approve(user, id); back(here, "ok", "Marriage approved. The couple may now be scheduled for the wedding.");
      case "withdraw": await withdrawApproval(user, id); back(here, "ok", "Approval withdrawn.");
      case "cancel": await cancelOrReopen(user, id, false); back(here, "ok", "File cancelled and its banns announcements removed.");
      case "reopen": await cancelOrReopen(user, id, true); back(here, "ok", "File re-opened.");
      case "convert": {
        const date = dateOf(fd, "date_of_marriage");
        if (!date) back(here, "error", "Enter the actual date of the wedding.");
        const mid = await convertToMatrimony(user, id, { dateOfMarriage: date!, placeOfMarriage: optStr(fd, "place_of_marriage", 250), minister: optStr(fd, "minister", 250), witnesses: optStr(fd, "witnesses", 500), recordNo: optStr(fd, "record_no", 50) });
        back(`/matrimony/${mid}`, "ok", "Matrimony register entry created and marginal notes added to the baptismal entries.");
      }
      default: back(here, "error", "Unknown action.");
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // Next's redirect() signal
    back(here, "error", msg(e, "The action could not be completed. Nothing was changed."));
  }
}

export async function candidateAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const cid = intOf(fd, "candidate_id"), act = str(fd, "do", 20);
  if (!cid) redirect("/registers/candidates");
  const here = `/registers/candidates/${cid}`;
  try {
    switch (act) {
      case "add_sponsor": {
        const r = await addSponsor(user, cid, {
          sponsorName: str(fd, "sponsor_name", 250), role: oneOf(fd, "sponsor_role", ["godfather", "godmother", "sponsor"] as const) ?? "sponsor", age: intOf(fd, "sponsor_age"),
          isCatholic: checked(fd, "is_catholic"), isConfirmed: checked(fd, "is_confirmed"), hasReceivedEucharist: checked(fd, "has_received_eucharist"), isPractising: checked(fd, "is_practising"),
          marriageRegular: checked(fd, "marriage_regular"), isParent: checked(fd, "is_parent_of_candidate"), parishionerId: intOf(fd, "parishioner_id"),
        });
        back(here, r.eligibility === "eligible" ? "ok" : "error", r.eligibility === "eligible" ? "Sponsor added — eligible." : `Sponsor added but flagged “${r.eligibility.replace("_", " ")}”: ${r.issues.join(" ")}`.slice(0, 290));
      }
      case "override_sponsor": await overrideSponsor(user, cid, intOf(fd, "sponsor_id") ?? 0, str(fd, "reason", 500)); back(here, "ok", "Eligibility overridden and recorded.");
      case "delete_sponsor": await deleteSponsor(user, cid, intOf(fd, "sponsor_id") ?? 0); back(here, "ok", "Sponsor removed.");
      case "withdraw": await withdrawCandidate(user, cid); back(here, "ok", "Candidate marked as withdrawn.");
      case "promote": {
        const date = dateOf(fd, "date");
        if (!date) back(here, "error", "Enter the date the sacrament was celebrated.");
        const summary = await promote(user, cid, { date: date!, minister: optStr(fd, "minister", 250), place: optStr(fd, "place", 250), recordNo: optStr(fd, "record_no", 50), withBaptism: checked(fd, "with_baptism"), withConfirmation: checked(fd, "with_confirmation"), withCommunion: checked(fd, "with_communion"), force: checked(fd, "force") });
        back(here, "ok", `Entered in the register: ${summary}. Please check the new entries and fill in anything the preparation file did not hold.`);
      }
      default: back(here, "error", "Unknown action.");
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    back(here, "error", msg(e, "The action could not be completed. Nothing was changed."));
  }
}

export async function attendanceAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const date = dateOf(fd, "date"), program = str(fd, "program", 30), cls = str(fd, "class_group", 100);
  const qs = new URLSearchParams({ ...(program && { program }), ...(cls && { class_group: cls }), ...(date && { date }) }).toString();
  const here = `/candidates/attendance${qs ? `?${qs}` : ""}`;
  if (!date) back("/candidates/attendance", "error", "Pick a valid session date.");
  const present = fd.getAll("present").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  try { const shown = (await activeCandidatesFor(user, oneOf(fd, "program", PROGRAM_KEYS) ?? "", cls)).map((c) => c.id); // only candidates on this roll-call can be marked
    const n = await recordSession(user, date!, shown, present); back(here, "ok", `Attendance saved for ${n} candidate${n === 1 ? "" : "s"} on ${date}.`); }
  catch (e) { if (e && typeof e === "object" && "digest" in e) throw e; back(here, "error", msg(e, "Could not save attendance.")); }
}
