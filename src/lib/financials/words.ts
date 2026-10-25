/**
 * Spells out a monetary amount the way the PHP app does (includes/functions.php amount_to_words),
 * e.g. 1250.50 -> "One Thousand Two Hundred Fifty Ghana Cedis and Fifty Pesewas Only".
 * Pure + shared by the browser form (live fill) and the server (fallback), so they always agree.
 */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigits(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)]!;
    n %= 10;
    parts.push(n > 0 ? `${t}-${ONES[n]}` : t);
  } else if (n > 0) parts.push(ONES[n]!);
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const words: string[] = [];
  for (const [value, label] of [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]] as const) {
    if (n >= value) { words.push(`${threeDigits(Math.floor(n / value))} ${label}`); n %= value; }
  }
  if (n > 0) words.push(threeDigits(n));
  return words.join(" ");
}

export function amountToWords(amount: number, major = "Ghana Cedis", minor = "Pesewas"): string {
  const pesewas = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(pesewas / 100);
  const fraction = pesewas % 100;
  let words = `${numberToWords(whole)} ${major}`;
  if (fraction > 0) words += ` and ${numberToWords(fraction)} ${minor}`;
  return `${words} Only`;
}
