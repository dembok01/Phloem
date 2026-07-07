// Contact link helpers (§10 coordinator member page). WhatsApp deep links use
// https://wa.me/{E.164 digits}; tel: uses the same digit stream.

/** Strip a phone string down to its digits; null if too short to be usable. */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function waMeLink(phone: string | null | undefined): string | null {
  const d = phoneDigits(phone);
  return d ? `https://wa.me/${d}` : null;
}

export function telHref(phone: string | null | undefined): string | null {
  const d = phoneDigits(phone);
  return d ? `tel:+${d}` : null;
}
