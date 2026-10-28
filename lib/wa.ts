// Contact link helpers (§10 coordinator member page, the emergency card). Numbers are
// stored as families typed them: mostly ten digits with no country code, sometimes
// with "+91", now and then two numbers in one field. Only the first number is used.

type Typed = { plus: boolean; digits: string };

/** The first number in a field: whether it was typed with "+", and its digits. */
function firstNumber(phone: string | null | undefined): Typed | null {
  const first = (phone ?? "").split(/[/,;]|\bor\b/)[0].trim();
  const digits = first.replace(/\D/g, "");
  return digits ? { plus: first.startsWith("+"), digits } : null;
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

/** tel: dials what was typed — "+" only when it was typed (or an Indian number
 * written with 91 and no "+"), so a local number dials locally. Short emergency
 * numbers (108, 999) are kept. */
export function telHref(phone: string | null | undefined): string | null {
  const n = firstNumber(phone);
  if (!n || n.digits.length < 3) return null;
  const plus = n.plus || (n.digits.length === 12 && n.digits.startsWith("91"));
  return `tel:${plus ? "+" : ""}${n.digits}`;
}
