/**
 * admin-services/store-notice.ts — the storefront notice banner, shared by
 * /api/admin/store-notice (GET/PUT/PATCH/DELETE) and the MCP notice_* tools.
 *
 * One notice per store (StoreNotice.tenantId is unique). Reading is open to any
 * admin; changing it publishes to the public storefront, so it needs the same
 * roles as publishing the store (ADMIN / SUPER_ADMIN; API keys act as ADMIN).
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail, type ServiceResult, type ServiceFail, type AdminActor } from "./result";
import { canPublish } from "./settings";
import {
  resolveNotice,
  noticeStatus,
  noticeStatusLabel,
  noticeDismissKey,
  formatNoticeTime,
  storeNoticePatchSchema,
  type StoreNoticePatch,
  type StoreNoticeRow,
  type StoreNoticeValues,
  type NoticeStyle,
} from "@/lib/store-notice";

type Actor = Pick<AdminActor, "role">;

export function noticeEditDenied(actor: Actor): ServiceFail | null {
  if (canPublish(actor.role)) return null;
  return fail(403, "Only an ADMIN or SUPER_ADMIN can change the storefront notice. Nothing was saved.");
}

/** Parse a raw admin request body with the same schema the MCP tools use. */
export function parseNoticePatch(body: unknown): { ok: true; patch: StoreNoticePatch } | ServiceFail {
  const r = storeNoticePatchSchema.safeParse(body ?? {});
  if (!r.success) return fail(400, r.error.issues[0]?.message ?? "Invalid notice", { issues: r.error.issues });
  const patch: StoreNoticePatch = {};
  for (const [k, v] of Object.entries(r.data)) if (v !== null && v !== undefined) (patch as Record<string, unknown>)[k] = v;
  return { ok: true, patch };
}

async function load(db: TenantPrisma): Promise<StoreNoticeRow | null> {
  const row = await db.storeNotice.findFirst({ where: {} });
  return row ? { ...row, style: row.style as NoticeStyle } : null;
}

/** JSON view: values, computed status, and Los Angeles display times. */
export function noticeView(n: (StoreNoticeValues & Partial<Pick<StoreNoticeRow, "id" | "updatedAt">>) | null, now = new Date()) {
  return {
    status: noticeStatus(n, now),
    statusLabel: noticeStatusLabel(n, now),
    notice: n
      ? {
          ...(n.id ? { id: n.id } : {}),
          message: n.message,
          linkLabel: n.linkLabel,
          linkUrl: n.linkUrl,
          style: n.style,
          isVisible: n.isVisible,
          startsAt: n.startsAt?.toISOString() ?? null,
          endsAt: n.endsAt?.toISOString() ?? null,
          startsAtPT: n.startsAt ? formatNoticeTime(n.startsAt) : "immediately",
          endsAtPT: n.endsAt ? formatNoticeTime(n.endsAt) : "never",
          ...(n.updatedAt ? { updatedAt: n.updatedAt.toISOString(), dismissKey: noticeDismissKey(n as StoreNoticeRow) } : {}),
        }
      : null,
  };
}

export async function getNotice(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  return ok(noticeView(await load(db)));
}

// ── set / update ─────────────────────────────────────────────────────────────

export async function previewSetNotice(db: TenantPrisma, actor: Actor, patch: StoreNoticePatch, now = new Date()): Promise<ServiceResult<unknown>> {
  const denied = noticeEditDenied(actor);
  if (denied) return denied;
  const current = await load(db);
  const r = resolveNotice(current, patch, now);
  if (!r.ok) return fail(400, r.error);
  const after = noticeView(r.values, now);
  return ok({
    action: current ? "update_store_notice" : "create_store_notice",
    before: current ? noticeView(current, now) : null,
    after,
    publicEffect:
      after.status === "live"
        ? "The banner shows at the top of the live storefront as soon as this is saved."
        : `The banner will not be on the storefront right now (${after.statusLabel}).`,
    sendsEmail: false,
  });
}

export async function setNotice(db: TenantPrisma, actor: Actor, patch: StoreNoticePatch, now = new Date()): Promise<ServiceResult<unknown>> {
  const denied = noticeEditDenied(actor);
  if (denied) return denied;
  const current = await load(db);
  const r = resolveNotice(current, patch, now);
  if (!r.ok) return fail(400, r.error);
  const row = current
    ? await db.storeNotice.update({ where: { id: current.id }, data: r.values })
    : await db.storeNotice.create({ data: r.values as never });
  return ok(noticeView({ ...row, style: row.style as NoticeStyle }, now));
}

// ── show / hide ──────────────────────────────────────────────────────────────

export async function previewSetNoticeVisibility(db: TenantPrisma, actor: Actor, isVisible: boolean, now = new Date()): Promise<ServiceResult<unknown>> {
  const denied = noticeEditDenied(actor);
  if (denied) return denied;
  const current = await load(db);
  if (!current) return fail(404, "There is no storefront notice yet. Create one with notice_set.");
  const after = noticeView({ ...current, isVisible }, now);
  return ok({
    action: isVisible ? "show_store_notice" : "hide_store_notice",
    message: current.message,
    before: noticeView(current, now).statusLabel,
    after: after.statusLabel,
    sendsEmail: false,
  });
}

export async function setNoticeVisibility(db: TenantPrisma, actor: Actor, isVisible: boolean, now = new Date()): Promise<ServiceResult<unknown>> {
  const denied = noticeEditDenied(actor);
  if (denied) return denied;
  const current = await load(db);
  if (!current) return fail(404, "There is no storefront notice yet.");
  const row = await db.storeNotice.update({ where: { id: current.id }, data: { isVisible } });
  return ok(noticeView({ ...row, style: row.style as NoticeStyle }, now));
}

// ── clear ────────────────────────────────────────────────────────────────────

export async function previewClearNotice(db: TenantPrisma, actor: Actor): Promise<ServiceResult<unknown>> {
  const denied = noticeEditDenied(actor);
  if (denied) return denied;
  const current = await load(db);
  if (!current) return fail(404, "There is no storefront notice to clear.");
  return ok({ action: "delete_store_notice", deletes: noticeView(current), sendsEmail: false });
}

export async function clearNotice(db: TenantPrisma, actor: Actor): Promise<ServiceResult<unknown>> {
  const denied = noticeEditDenied(actor);
  if (denied) return denied;
  const current = await load(db);
  if (!current) return fail(404, "There is no storefront notice to clear.");
  await db.storeNotice.delete({ where: { id: current.id } });
  return ok({ deleted: true });
}
