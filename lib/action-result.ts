import { rpcErrorCode, rpcErrorMessage, type RpcErrorCode } from "@/lib/rpc-errors";

/**
 * The one shape every "return-object" server action speaks (T2.4). Success
 * carries typed `data`; failure carries user-facing `error` copy plus the typed
 * `code` from the §6 RPC (via the T1.6 registry) so callers can branch on it when
 * they need to. Redirect-style actions keep their `?ok=/?error=` UX and derive
 * flash codes from the same registry.
 */
/** The failure half — assignable to `ActionResult<T>` for any `T`. */
export type ActionFailure = { ok: false; error: string; code: RpcErrorCode | null };

export type ActionResult<T = void> = { ok: true; data: T } | ActionFailure;

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(error: string, code: RpcErrorCode | null = null): ActionFailure {
  return { ok: false, error, code };
}

/** Build a failure result from a Supabase/PostgREST error: registry copy + typed code. */
export function actionFromError(
  error: { message: string },
  fallback: string,
  overrides?: Partial<Record<RpcErrorCode, string>>,
): ActionFailure {
  return { ok: false, error: rpcErrorMessage(error, fallback, overrides), code: rpcErrorCode(error) };
}
