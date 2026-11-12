/**
 * instagram-oauth.ts — OAuth `state` for the artisan Instagram connect flow.
 *
 * /api/admin/instagram/connect puts { artisanId, nonce } in the state and the
 * same nonce in an httpOnly cookie; /callback only proceeds when they match.
 * Without this, the state was just base64(artisanId), so a signed-in admin who
 * opened a callback URL crafted by someone else would connect that person's
 * Instagram account to the artisan.
 */
import { timingSafeEqual } from "crypto";

export const IG_STATE_COOKIE = "as-ig-oauth-state";

export interface IgState {
  artisanId: string;
  nonce: string;
}

export function encodeIgState(state: IgState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeIgState(raw: string): IgState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as Partial<IgState>;
    if (typeof parsed.artisanId !== "string" || !parsed.artisanId) return null;
    if (typeof parsed.nonce !== "string" || !/^[0-9a-f]{32}$/.test(parsed.nonce)) return null;
    return { artisanId: parsed.artisanId, nonce: parsed.nonce };
  } catch {
    return null;
  }
}

export function nonceMatches(fromState: string, fromCookie: string | undefined): boolean {
  if (!fromCookie || fromCookie.length !== fromState.length) return false;
  return timingSafeEqual(Buffer.from(fromState), Buffer.from(fromCookie));
}
