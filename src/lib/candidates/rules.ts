/** Sponsor eligibility and candidate readiness (ports of SponsorService::evaluate and CandidateService::readiness). Pure + unit-tested. */
export interface SponsorFacts {
  sponsorAge: number | null; isCatholic: number | null; isConfirmed: number | null; hasReceivedEucharist: number | null;
  isPractising: number | null; marriageRegular: number | null; isParentOfCandidate: boolean | number | null;
}
export type Eligibility = "eligible" | "needs_review" | "ineligible";

/**
 * Hard failures make a sponsor ineligible; unknowns ("not verified") make them need review; only a fully verified, passing
 * sponsor is eligible. null means "not known", which is deliberately different from 0 ("no").
 */
export function evaluateSponsor(s: SponsorFacts, minAge: number): { eligibility: Eligibility; issues: string[] } {
  const hard: string[] = [], soft: string[] = [];
  if (s.isCatholic === 0) hard.push("Must be a Catholic (a baptised non-Catholic may only act as a Christian witness beside a Catholic sponsor).");
  if (s.sponsorAge === null || s.sponsorAge === undefined) soft.push(`Age not recorded (minimum ${minAge}).`);
  else if (s.sponsorAge < minAge) hard.push(`Under the minimum age of ${minAge}.`);
  if (s.isConfirmed === null || s.isConfirmed === undefined) soft.push("Confirmation not verified."); else if (s.isConfirmed === 0) hard.push("Has not been confirmed.");
  if (s.hasReceivedEucharist === null || s.hasReceivedEucharist === undefined) soft.push("First Communion not verified."); else if (s.hasReceivedEucharist === 0) hard.push("Has not received the Holy Eucharist.");
  if (s.isPractising === null || s.isPractising === undefined) soft.push("Practice of the faith not verified."); else if (s.isPractising === 0) soft.push("Not currently practising — life must be in keeping with the role.");
  if (s.marriageRegular === 0) hard.push("Living in an irregular marriage situation.");
  if (s.isParentOfCandidate) hard.push("A parent cannot be the sponsor of their own child.");
  return { eligibility: hard.length ? "ineligible" : soft.length ? "needs_review" : "eligible", issues: [...hard, ...soft] };
}

/** Sponsor facts read off a census record (null = the census cannot say). */
export interface CensusFacts {
  fullName: string; dobYear: number | null; baptisedStatus: string; confirmationStatus: string; communionStatus: string; practisingStatus: string; maritalStatus: string | null;
}
export function sponsorFactsFromCensus(p: CensusFacts, thisYear: number): SponsorFacts & { sponsorName: string } {
  const received = (s: string) => (s === "received_here" || s === "received_elsewhere" ? 1 : s === "not_received" ? 0 : null);
  const irregular = ["married_customary", "civil_only", "divorced_remarried"].includes(p.maritalStatus ?? "");
  return {
    sponsorName: p.fullName, sponsorAge: p.dobYear ? thisYear - p.dobYear : null,
    isCatholic: p.baptisedStatus === "baptised_here" || p.baptisedStatus === "baptised_elsewhere" ? 1 : null,
    isConfirmed: received(p.confirmationStatus), hasReceivedEucharist: received(p.communionStatus),
    isPractising: p.practisingStatus === "practising" ? 1 : p.practisingStatus === "unknown" ? null : 0,
    marriageRegular: irregular ? 0 : 1, isParentOfCandidate: false,
  };
}

export interface CandidateFacts { program: string; stage: string | null; candidateStatus: string; interviewResult: string | null; baptismId: number | null; baptismPlace: string | null }
export const SPONSOR_PROGRAMS = ["baptism_child", "baptism_adult", "confirmation", "rcia"];

/** What is still missing before a candidate can be entered in the register (empty = ready). */
export function readiness(c: CandidateFacts, att: { percent: number | null }, minPercent: number, eligibleSponsors: number): string[] {
  const b: string[] = [];
  if (c.interviewResult !== "passed") b.push("The interview has not been marked as passed.");
  if (att.percent === null) b.push("No attendance has been recorded.");
  else if (att.percent < minPercent) b.push(`Attendance is ${att.percent}% (minimum ${minPercent}%).`);
  if (["first_communion", "confirmation"].includes(c.program) && !c.baptismId && !c.baptismPlace) b.push("Baptism details are missing — a candidate must be baptised first.");
  if (["baptism_child", "baptism_adult", "confirmation"].includes(c.program) && eligibleSponsors === 0) b.push("No eligible godparent/sponsor has been recorded.");
  if (c.program === "rcia" && !["sacraments", "completed"].includes(c.stage ?? "")) b.push("The candidate has not yet reached the “Sacraments” stage (election/enrolment).");
  if (c.candidateStatus === "promoted") b.push("Already entered in the register.");
  return b;
}

export interface PromoteChoice { withBaptism: boolean; withConfirmation: boolean; withCommunion: boolean }

/** Which sacraments entering this candidate records. RCIA leaves the choice to the priest (baptism only if not already baptised). */
export function promotionPlan(program: string, alreadyBaptised: boolean, c: PromoteChoice): { baptism: boolean; confirmation: boolean; communion: boolean } {
  return {
    baptism: program === "baptism_child" || program === "baptism_adult" || (program === "rcia" && !alreadyBaptised && c.withBaptism),
    confirmation: program === "confirmation" || (program === "rcia" && c.withConfirmation),
    communion: program === "first_communion" || (program === "rcia" && c.withCommunion),
  };
}

export const attendancePercent = (held: number, present: number): number | null => (held > 0 ? Math.round((100 * present) / held) : null);
