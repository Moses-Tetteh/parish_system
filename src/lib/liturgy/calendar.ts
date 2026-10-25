/**
 * Roman-rite liturgical calendar (port of LiturgicalCalendarService.php). Pure: dates are ISO strings (UTC arithmetic),
 * fixed celebrations are passed in (from the liturgical_days register), so the whole thing is unit-tested without a database.
 */
export type Rank = "weekday" | "optional_memorial" | "memorial" | "local" | "feast" | "solemnity";
export type Colour = "white" | "red" | "green" | "purple" | "rose" | "black";
export interface Celebration { name: string; rank: Rank; colour: Colour; hdo: boolean }
export interface FixedDay { month: number; day: number; name: string; rank: Rank; colour: Colour; hdo: boolean }
export interface CalendarSettings { ascensionOnSunday: boolean; corpusChristiOnSunday: boolean; epiphanyOnSunday: boolean }
export interface DayInfo { date: string; name: string; rank: Rank; colour: Colour; season: string; holyDayOfObligation: boolean; also: string[]; isSunday: boolean }

export const DEFAULT_SETTINGS: CalendarSettings = { ascensionOnSunday: false, corpusChristiOnSunday: true, epiphanyOnSunday: true };

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(ms(d) + n * 86_400_000);
const dow = (d: string) => new Date(ms(d)).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000);
const pad = (n: number) => String(n).padStart(2, "0");
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const WEIGHT: Record<Rank, number> = { weekday: 0, optional_memorial: 1, memorial: 2, local: 2, feast: 3, solemnity: 4 };

/** Gregorian Easter Sunday (the anonymous/Meeus algorithm). */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** First Sunday of Advent: four Sundays before 25 December (the Sunday before it is the 4th). */
export function adventStart(year: number): string {
  const xmas = `${year}-12-25`, w = dow(xmas);
  return addDays(addDays(xmas, -(w === 0 ? 7 : w)), -21);
}

export class LiturgicalCalendar {
  private moveableCache = new Map<number, Map<string, Celebration>>();
  private fixed = new Map<string, FixedDay[]>();
  constructor(fixedDays: FixedDay[] = [], private s: CalendarSettings = DEFAULT_SETTINGS) {
    for (const f of fixedDays) { const k = `${f.month}-${f.day}`; (this.fixed.get(k) ?? this.fixed.set(k, []).get(k)!).push(f); }
  }

  epiphany(year: number): string {
    if (!this.s.epiphanyOnSunday) return `${year}-01-06`;
    let d = `${year}-01-02`;
    while (dow(d) !== 0) d = addDays(d, 1);
    return d; // the Sunday between 2 and 8 January
  }

  baptismOfTheLord(year: number): string {
    const ep = this.epiphany(year);
    if (this.s.epiphanyOnSunday) return Number(ep.slice(8)) >= 7 ? addDays(ep, 1) : addDays(ep, 7);
    let d = `${year}-01-07`;
    while (dow(d) !== 0) d = addDays(d, 1);
    return d;
  }

  moveable(year: number): Map<string, Celebration> {
    const cached = this.moveableCache.get(year);
    if (cached) return cached;
    const e = easter(year), at = (n: number) => addDays(e, n);
    const m = new Map<string, Celebration>();
    const add = (date: string, name: string, rank: Rank, colour: Colour, hdo = false) => m.set(date, { name, rank, colour, hdo });
    add(at(-46), "Ash Wednesday", "solemnity", "purple");
    add(at(-7), "Palm Sunday of the Passion of the Lord", "solemnity", "red");
    add(at(-3), "Holy Thursday — Mass of the Lord’s Supper", "solemnity", "white");
    add(at(-2), "Good Friday of the Lord’s Passion", "solemnity", "red");
    add(at(-1), "Holy Saturday — Easter Vigil", "solemnity", "white");
    add(at(0), "Easter Sunday of the Resurrection of the Lord", "solemnity", "white");
    add(at(7), "Second Sunday of Easter (Divine Mercy)", "solemnity", "white");
    add(this.s.ascensionOnSunday ? at(42) : at(39), "Ascension of the Lord", "solemnity", "white", true);
    add(at(49), "Pentecost Sunday", "solemnity", "red");
    add(at(56), "Most Holy Trinity", "solemnity", "white");
    add(this.s.corpusChristiOnSunday ? at(63) : at(60), "Most Holy Body and Blood of Christ (Corpus Christi)", "solemnity", "white");
    add(at(68), "Most Sacred Heart of Jesus", "solemnity", "white");
    add(addDays(adventStart(year), -7), "Our Lord Jesus Christ, King of the Universe", "solemnity", "white");
    add(this.epiphany(year), "Epiphany of the Lord", "solemnity", "white");
    add(this.baptismOfTheLord(year), "Baptism of the Lord", "feast", "white");
    const xmas = `${year}-12-25`;
    add(dow(xmas) === 0 ? `${year}-12-30` : addDays(xmas, 7 - dow(xmas)), "Holy Family of Jesus, Mary and Joseph", "feast", "white");
    this.moveableCache.set(year, m);
    return m;
  }

  season(d: string): [name: string, colour: Colour] {
    const y = Number(d.slice(0, 4)), e = easter(y), ash = addDays(e, -46), holyThu = addDays(e, -3), pentecost = addDays(e, 49);
    if (d >= adventStart(y) && d < `${y}-12-25`) return ["Advent", "purple"];
    if (d >= `${y}-12-25` || d <= this.baptismOfTheLord(y)) return ["Christmas", "white"];
    if (d >= ash && d < holyThu) return ["Lent", "purple"];
    if (d >= holyThu && d < e) return ["Easter Triduum", "white"];
    if (d >= e && d <= pentecost) return ["Easter", "white"];
    return ["Ordinary Time", "green"];
  }

  private sundayName(d: string, season: string): string {
    const y = Number(d.slice(0, 4)), e = easter(y);
    switch (season) {
      case "Advent": return `${ordinal(Math.floor(daysBetween(adventStart(y), d) / 7) + 1)} Sunday of Advent`;
      case "Lent": return `${ordinal(Math.floor(daysBetween(addDays(e, -46), d) / 7) + 1)} Sunday of Lent`;
      case "Easter": return `${ordinal(Math.floor(daysBetween(e, d) / 7) + 1)} Sunday of Easter`;
      case "Christmas": return "Sunday of the Christmas Season";
      default: {
        const n = d > addDays(e, 49) ? 34 - Math.floor(daysBetween(d, addDays(adventStart(y), -7)) / 7) : 1 + Math.floor(daysBetween(this.baptismOfTheLord(y), d) / 7);
        return `${ordinal(n)} Sunday in Ordinary Time`;
      }
    }
  }

  forDate(d: string): DayInfo {
    const y = Number(d.slice(0, 4)), [season, seasonColour] = this.season(d), isSunday = dow(d) === 0;
    const moveable = this.moveable(y).get(d) ?? null;
    const fixed = this.fixed.get(`${Number(d.slice(5, 7))}-${Number(d.slice(8, 10))}`) ?? [];
    let primary: Celebration | null = moveable;
    const also: string[] = [];
    if (isSunday && moveable === null) primary = { name: this.sundayName(d, season), rank: "solemnity", colour: seasonColour, hdo: true };
    for (const f of fixed) {
      const cel: Celebration = { name: f.name, rank: f.rank, colour: f.colour, hdo: f.hdo };
      const outranksSunday = isSunday && primary !== null && moveable === null && ["Ordinary Time", "Christmas"].includes(season)
        && (f.rank === "solemnity" || ["Presentation of the Lord", "Transfiguration of the Lord", "Exaltation of the Holy Cross"].includes(f.name));
      if (primary === null || outranksSunday || (!isSunday && WEIGHT[f.rank] > WEIGHT[primary.rank])) { if (primary) also.push(primary.name); primary = cel; }
      else also.push(f.name);
    }
    if (primary === null) primary = { name: `Weekday in ${season}`, rank: "weekday", colour: seasonColour, hdo: false };
    return { date: d, name: primary.name, rank: primary.rank, colour: primary.colour, season, holyDayOfObligation: primary.hdo || (isSunday && primary.rank !== "weekday"), also, isSunday };
  }
}

export const COLOUR_HEX: Record<string, string> = { white: "#f4f1e6", red: "#b3261e", green: "#2e7d32", purple: "#6a1b9a", rose: "#e91e8c", black: "#222" };
export const weekStart = (dateIso: string): string => addDays(dateIso, -dow(dateIso)); // the Sunday on or before
export { addDays, dow as dayOfWeek };
