// Contact link helpers (§10 coordinator member page, the emergency card). Numbers are
// stored as families typed them: mostly ten digits with no country code, sometimes
// with "+91", now and then two numbers in one field. Only the first number is used.

type Typed = { plus: boolean; digits: string };

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** The first number in a field: whether it was typed with "+", and its digits. Null
 * rather than a link to a number that cannot exist (more than 15 digits). */
function firstNumber(phone: string | null | undefined): Typed | null {
  let first = (phone ?? "").split(/[/,;&\n]|\bor\b|\band\b|\s[-–]\s/)[0].trim();
  if (digitsOf(first).length > 15) {
    // Two numbers with only a space between: take words until one number's worth.
    let acc = "";
    for (const word of first.split(/\s+/)) {
      acc = acc ? `${acc} ${word}` : word;
      if (digitsOf(acc).length >= 10) break;
    }
    first = acc;
  }
  const digits = digitsOf(first);
  return digits && digits.length <= 15 ? { plus: first.startsWith("+"), digits } : null;
}

/** Strip a phone string down to its digits; null if too short to be usable. */
export function phoneDigits(phone: string | null | undefined): string | null {
  const n = firstNumber(phone);
  return n && n.digits.length >= 8 ? n.digits : null;
}

/** https://wa.me/{country code + number}. WhatsApp needs the country code, so a
 * ten-digit (or 0-prefixed) number is taken as Indian. */
export function waMeLink(phone: string | null | undefined): string | null {
  const n = firstNumber(phone);
  if (!n || n.digits.length < 8) return null;
  let d = n.digits;
  if (!n.plus && d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!n.plus && d.length === 10) d = `91${d}`;
  return `https://wa.me/${d}`;
}

/** tel: dials what was typed, so a local number dials locally. "+" when it was typed,
 * or when the digits carry a country code without it (11+ digits not starting with 0,
 * e.g. 91…, 971…, 44…; 1800 toll-free excepted). Short emergency numbers (108, 999) are
 * kept. */
export function telHref(phone: string | null | undefined): string | null {
  const n = firstNumber(phone);
  if (!n || n.digits.length < 3) return null;
  const countryCode = n.digits.length >= 11 && !n.digits.startsWith("0") && !n.digits.startsWith("1800");
  return `tel:${n.plus || countryCode ? "+" : ""}${n.digits}`;
}
