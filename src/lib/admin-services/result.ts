/**
 * admin-services/result.ts — framework-free result type for shared admin logic.
 *
 * Service functions (called by BOTH the /api/admin/* route handlers and the MCP
 * tools) return a ServiceResult instead of a NextResponse. `data` / `body` are
 * the exact JSON the route used to send, so routes keep identical responses:
 * see `toResponse` in ./http.ts.
 */
export type ServiceOk<T> = { ok: true; data: T; status?: number };
export type ServiceFail = {
  ok: false;
  status: number;
  body: { error: string; [k: string]: unknown };
};
export type ServiceResult<T> = ServiceOk<T> | ServiceFail;

export function ok<T>(data: T, status?: number): ServiceOk<T> {
  return status === undefined ? { ok: true, data } : { ok: true, data, status };
}

export function fail(status: number, error: string, extra?: Record<string, unknown>): ServiceFail {
  return { ok: false, status, body: { error, ...(extra ?? {}) } };
}

/** Acting admin, for the few routes that check role (team management). */
export interface AdminActor {
  id: string;
  role: string;
}
