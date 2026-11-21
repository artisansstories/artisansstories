/**
 * store-notice.ts — the storefront notice banner: one shared input schema (admin
 * API + MCP), the merge/validate step, the active-window rule, and the
 * America/Los_Angeles time helpers. Framework-free so unit tests and the client
 * admin page can import it.
 *
 * Times are stored UTC. Input accepts an ISO time with an offset/Z, or a naive
 * "YYYY-MM-DDTHH:mm" read as Los Angeles wall time (what <input type=
 * "datetime-local"> sends). An empty start means "now" (immediate).
 */
import { z } from "zod";

export const NOTICE_TZ = "America/Los_Angeles";
export const NOTICE_MAX_MESSAGE = 280;
export const NOTICE_MAX_LINK_LABEL = 40;
export const NOTICE_MAX_URL = 500;
export const NOTICE_STYLES = ["info", "success", "warning", "urgent"] as const;
export type NoticeStyle = (typeof NOTICE_STYLES)[number];

/** Patch fields. Omitted = keep the saved value; "" clears an optional field. */
export const STORE_NOTICE_INPUT = {
  message: z
    .string()
    .max(2000)
    .nullish()
    .describe(`Banner text, plain text, max ${NOTICE_MAX_MESSAGE} characters. Required when no notice exists yet.`),
  linkLabel: z.string().max(200).nullish().describe(`Optional link text (max ${NOTICE_MAX_LINK_LABEL}). Empty string removes the link.`),
  linkUrl: z
    .string()
    .max(2000)
    .nullish()
    .describe("Optional link target: https://… or a site path like /shop. Empty string removes the link."),
  style: z.enum(NOTICE_STYLES).nullish().describe("info (default), success, warning or urgent"),
  isVisible: z.boolean().nullish().describe("true = show (subject to the start/expiry window), false = hide"),
  startsAt: z
    .string()
    .max(40)
    .nullish()
    .describe(
      'Start time. ISO 8601 with offset (2026-11-21T09:00:00-08:00) or "YYYY-MM-DDTHH:mm" in Los Angeles time. Empty string or "now" = start immediately.',
    ),
  endsAt: z
    .string()
    .max(40)
    .nullish()
    .describe('Optional expiry, same formats as startsAt; must be after the start. Empty string = never expires.'),
};

export const storeNoticePatchSchema = z.object(STORE_NOTICE_INPUT);
export type StoreNoticePatch = { [K in keyof z.infer<typeof storeNoticePatchSchema>]?: Exclude<z.infer<typeof storeNoticePatchSchema>[K], null> };

export interface StoreNoticeValues {
  message: string;
  linkLabel: string | null;
  linkUrl: string | null;
  style: NoticeStyle;
  isVisible: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface StoreNoticeRow extends StoreNoticeValues {
  id: string;
  updatedAt: Date;
}

// ── time helpers ──────────────────────────────────────────────────────────────

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

function laParts(t: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NOTICE_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Los Angeles UTC offset (ms, negative) at instant t. */
function laOffsetMs(t: number): number {
  const p = laParts(t);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** Parse a notice time. "" / "now" → null (caller substitutes now). */
export function parseNoticeTime(input: string): Date | null | "invalid" {
  const s = input.trim();
  if (s === "" || s.toLowerCase() === "now") return null;
  const m = NAIVE.exec(s);
  if (m) {
    const [y, mo, d, h, mi, sec] = m.slice(1).map((v) => Number(v ?? 0));
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return "invalid";
    const guess = Date.UTC(y, mo - 1, d, h, mi, sec);
    const off1 = laOffsetMs(guess - 8 * 3600_000);
    let t = guess - off1;
    const off2 = laOffsetMs(t);
    if (off2 !== off1) t = guess - off2;
    return new Date(t);
  }
  if (WITH_ZONE.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? "invalid" : new Date(t);
  }
  return "invalid";
}

/** "Nov 21, 2026, 9:00 AM PT" */
export function formatNoticeTime(d: Date): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: NOTICE_TZ,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d) + " PT"
  );
}

/** Value for <input type="datetime-local"> in Los Angeles time. */
export function toNoticeInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const p = laParts(new Date(d).getTime());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

// ── validation ───────────────────────────────────────────────────────────────

/** https?:// absolute URL, or a site-relative path ("/shop"), never "//host" or javascript:. */
export function isSafeNoticeUrl(url: string): boolean {
  if (url.startsWith("/")) return !url.startsWith("//") && !url.includes("\\");
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
  } catch {
    return false;
  }
}

/**
 * Merge a patch over the saved notice (or defaults) and validate the result.
 * Returns the full values to store, or a human-readable error.
 */
export function resolveNotice(
  current: StoreNoticeValues | null,
  patch: StoreNoticePatch,
  now: Date,
): { ok: true; values: StoreNoticeValues } | { ok: false; error: string } {
  const opt = (v: string | undefined, keep: string | null) => (v === undefined ? keep : v.trim() || null);

  const message = (patch.message ?? current?.message ?? "").trim();
  if (!message) return { ok: false, error: "Message is required" };
  if (message.length > NOTICE_MAX_MESSAGE) return { ok: false, error: `Message is too long (max ${NOTICE_MAX_MESSAGE} characters)` };

  const linkLabel = opt(patch.linkLabel, current?.linkLabel ?? null);
  const linkUrl = opt(patch.linkUrl, current?.linkUrl ?? null);
  if (!!linkLabel !== !!linkUrl) return { ok: false, error: "A link needs both a label and a URL (or leave both empty)" };
  if (linkLabel && linkLabel.length > NOTICE_MAX_LINK_LABEL) return { ok: false, error: `Link label is too long (max ${NOTICE_MAX_LINK_LABEL} characters)` };
  if (linkUrl && (linkUrl.length > NOTICE_MAX_URL || !isSafeNoticeUrl(linkUrl))) {
    return { ok: false, error: "Link URL must start with https:// (or http://) or be a site path like /shop" };
  }

  let startsAt: Date | null;
  if (patch.startsAt !== undefined) {
    const p = parseNoticeTime(patch.startsAt);
    if (p === "invalid") return { ok: false, error: "Start time is not a valid date-time" };
    startsAt = p ?? now;
  } else {
    startsAt = current ? current.startsAt : now;
  }

  let endsAt: Date | null;
  if (patch.endsAt !== undefined) {
    const p = parseNoticeTime(patch.endsAt);
    if (p === "invalid") return { ok: false, error: "Expiration time is not a valid date-time" };
    endsAt = patch.endsAt.trim().toLowerCase() === "now" ? now : p;
  } else {
    endsAt = current?.endsAt ?? null;
  }
  if (endsAt && endsAt.getTime() <= (startsAt ?? now).getTime()) {
    return { ok: false, error: "Expiration must be after the start time" };
  }

  return {
    ok: true,
    values: {
      message,
      linkLabel,
      linkUrl,
      style: patch.style ?? current?.style ?? "info",
      isVisible: patch.isVisible ?? current?.isVisible ?? true,
      startsAt,
      endsAt,
    },
  };
}

// ── status ───────────────────────────────────────────────────────────────────

export type NoticeStatus = "none" | "hidden" | "scheduled" | "expired" | "live";

/** The single rule for "is the banner up": shown AND start ≤ now AND (no expiry OR now < expiry). */
export function noticeStatus(n: Pick<StoreNoticeValues, "isVisible" | "startsAt" | "endsAt"> | null, now: Date): NoticeStatus {
  if (!n) return "none";
  if (!n.isVisible) return "hidden";
  if (n.startsAt && now.getTime() < n.startsAt.getTime()) return "scheduled";
  if (n.endsAt && now.getTime() >= n.endsAt.getTime()) return "expired";
  return "live";
}

export function noticeStatusLabel(n: Pick<StoreNoticeValues, "isVisible" | "startsAt" | "endsAt"> | null, now: Date): string {
  const s = noticeStatus(n, now);
  if (s === "none") return "No notice";
  if (s === "hidden") return "Hidden";
  if (s === "scheduled") return `Scheduled — starts ${formatNoticeTime(n!.startsAt!)}`;
  if (s === "expired") return `Expired ${formatNoticeTime(n!.endsAt!)}`;
  return n!.endsAt ? `Live now — until ${formatNoticeTime(n!.endsAt)}` : "Live now";
}

/** localStorage key for a visitor's dismissal; changes whenever the notice is edited. */
export function noticeDismissKey(n: Pick<StoreNoticeRow, "id" | "updatedAt">): string {
  return `${n.id}:${new Date(n.updatedAt).getTime()}`;
}
