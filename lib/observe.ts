/**
 * Minimal structured logging — one JSON line per event to stdout/stderr, which
 * Vercel and Node capture. Deliberately vendor-free (blueprint non-goal: no
 * vendor lock); swap the sink here if a tracker is ever added. Both helpers
 * return the record so call sites and tests can assert on it.
 */
export type LogFields = Record<string, unknown>;

export function logEvent(evt: string, fields: LogFields = {}): LogFields {
  const record = { evt, level: "info", at: new Date().toISOString(), ...fields };
  console.log(JSON.stringify(record));
  return record;
}

export function logError(evt: string, error: unknown, fields: LogFields = {}): LogFields {
  const message = error instanceof Error ? error.message : String(error);
  const record = { evt, level: "error", at: new Date().toISOString(), error: message, ...fields };
  console.error(JSON.stringify(record));
  return record;
}
