import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/app-settings";
import { LiturgicalCalendar, type Colour, type FixedDay, type Rank } from "./calendar";

/** Builds the calendar from the Liturgical Days register and the three workflow switches in Settings. */
export async function loadCalendar(): Promise<LiturgicalCalendar> {
  const rows = await db().select().from(schema.liturgicalDays).where(eq(schema.liturgicalDays.isArchived, 0));
  const fixed: FixedDay[] = rows.map((r) => ({ month: r.monthNo, day: r.dayNo, name: r.name, rank: r.dayRank as Rank, colour: r.colour as Colour, hdo: r.holyDayOfObligation === 1 }));
  const [asc, cc, ep] = await Promise.all([getSetting("ascension_on_sunday", "0"), getSetting("corpus_christi_on_sunday", "1"), getSetting("epiphany_on_sunday", "1")]);
  return new LiturgicalCalendar(fixed, { ascensionOnSunday: asc === "1", corpusChristiOnSunday: cc === "1", epiphanyOnSunday: ep === "1" });
}
