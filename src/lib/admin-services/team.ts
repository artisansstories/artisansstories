/**
 * admin-services/team.ts — admin team management shared by /api/admin/team/*
 * and MCP.
 *
 * Role checks live here and take an `actor`, so the route (actor = admin
 * session, read live) and MCP (actor = { id: ctx.actorId, role: ctx.role })
 * enforce the same rules:
 *   - add / update: SUPER_ADMIN or ADMIN; remove: SUPER_ADMIN only
 *   - nobody changes their own role, or deactivates or removes themselves
 *   - only a SUPER_ADMIN may change, deactivate or remove a SUPER_ADMIN, or
 *     grant SUPER_ADMIN (MCP API keys act as ADMIN, so they never can)
 *   - the store always keeps at least one active SUPER_ADMIN. Writes lock the
 *     store's admin rows first, so concurrent requests can't both pass the check.
 * Previews run the same guards and are read-only.
 */
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { sendAdminInvite, adminBaseUrlForTenant } from "@/lib/admin-invite";
import { ok, fail, type ServiceResult, type ServiceFail, type AdminActor } from "./result";

/** Actor plus the display name used as `inviterName` in the invite request. */
export type TeamActor = AdminActor & { name?: string };

const MEMBER_SELECT = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } as const;

// ── guards ──────────────────────────────────────────────────────────────────

/**
 * The acting admin for the team routes, read LIVE from the database. The
 * session JWT lives 30 days, so its role can be stale: a deactivated admin
 * could re-activate themselves, and a demoted one keep managing the team.
 * Null when the admin no longer exists or is inactive (same bar as getMcpAdmin;
 * MCP OAuth tokens get the same live check in mcp/auth.ts).
 */
export async function teamActorFromSession(db: TenantPrisma, sessionAdminId: string): Promise<TeamActor | null> {
  const user = await db.adminUser.findUnique({
    where: { id: sessionAdminId },
    select: { id: true, role: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, role: user.role, name: user.name };
}

/** 403 unless the actor may add/update team members. */
export function teamManageDenied(actor: AdminActor): ServiceFail | null {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") return fail(403, "Forbidden");
  return null;
}

const OWNER_ONLY = "Only a SUPER_ADMIN (store owner) can change, deactivate or remove a SUPER_ADMIN.";
const API_KEY_NOTE = " AI assistant API keys act as ADMIN, so ask a SUPER_ADMIN to do this on the Team page (Admin → Team).";
const LAST_OWNER = "This would leave the store without an active SUPER_ADMIN (owner). Promote someone else to SUPER_ADMIN first (Admin → Team → Change role, or team_update with role SUPER_ADMIN), then try again.";

type Target = { id: string; role: string; isActive: boolean };
type Change = { role?: string; isActive?: boolean; remove?: boolean };

/**
 * Owner protection, shared by update, remove and their previews. Returns the
 * refusal in plain words with the next step, or null when allowed.
 */
export function ownerRuleDenied(actor: AdminActor, target: Target, change: Change): ServiceFail | null {
  const keyNote = actor.isApiKey ? API_KEY_NOTE : "";
  const changesRole = change.role !== undefined && change.role !== target.role;
  if (target.id === actor.id) {
    if (change.remove) return fail(400, "Cannot remove yourself. Another SUPER_ADMIN has to do it.");
    if (changesRole) return fail(403, "You can't change your own role. Another SUPER_ADMIN has to do it on the Team page.");
    if (change.isActive === false) return fail(403, "You can't deactivate yourself. Another SUPER_ADMIN has to do it on the Team page.");
  }
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN" && (changesRole || change.remove || (change.isActive !== undefined && change.isActive !== target.isActive))) {
    return fail(403, OWNER_ONLY + keyNote);
  }
  if (change.role === "SUPER_ADMIN" && changesRole && actor.role !== "SUPER_ADMIN") {
    return fail(403, "Only a SUPER_ADMIN can make someone a SUPER_ADMIN." + keyNote);
  }
  return null;
}

/** True when the change takes an active SUPER_ADMIN away. */
function dropsActiveOwner(target: Target, change: Change): boolean {
  if (target.role !== "SUPER_ADMIN" || !target.isActive) return false;
  return !!change.remove || change.isActive === false || (change.role !== undefined && change.role !== "SUPER_ADMIN");
}

async function otherActiveOwners(db: Pick<TenantPrisma, "adminUser">, tenantId: string, targetId: string): Promise<number> {
  return db.adminUser.count({ where: { tenantId, role: "SUPER_ADMIN", isActive: true, id: { not: targetId } } });
}

class Refused extends Error {
  constructor(readonly result: ServiceFail) {
    super(result.body.error);
  }
}

/**
 * Run a team write under a lock on every admin row of this store, after
 * re-reading the target and the acting admin and re-checking every rule. Two
 * concurrent requests serialize here, so the second one sees the first one's
 * change and the last-owner rule holds.
 */
async function lockedTeamWrite<T>(
  db: TenantPrisma,
  actor: AdminActor,
  id: string,
  change: Change,
  write: (tx: Parameters<Parameters<TenantPrisma["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<ServiceResult<T>> {
  const tenantId = db.$tenantId;
  try {
    const out = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AdminUser" WHERE "tenantId" = ${tenantId} ORDER BY id FOR UPDATE`;
      let liveActor = actor;
      if (!actor.isApiKey) {
        const row = await tx.adminUser.findUnique({ where: { id: actor.id }, select: { id: true, role: true, isActive: true } });
        if (!row || !row.isActive) throw new Refused(fail(401, "Unauthorized"));
        liveActor = { ...actor, role: row.role };
      }
      const roleDenied = change.remove ? teamRemoveDenied(liveActor) : teamManageDenied(liveActor);
      if (roleDenied) throw new Refused(roleDenied);
      const target = await tx.adminUser.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } });
      if (!target) throw new Refused(fail(404, "Admin not found"));
      const denied = ownerRuleDenied(liveActor, target, change);
      if (denied) throw new Refused(denied);
      if (dropsActiveOwner(target, change) && (await otherActiveOwners(tx, tenantId, target.id)) === 0) {
        throw new Refused(fail(409, LAST_OWNER));
      }
      return write(tx);
    });
    return ok(out);
  } catch (err) {
    if (err instanceof Refused) return err.result;
    throw err;
  }
}

/** 403 unless the actor may remove team members. */
export function teamRemoveDenied(actor: AdminActor): ServiceFail | null {
  if (actor.role !== "SUPER_ADMIN") return fail(403, "Forbidden — only SUPER_ADMIN can remove admins");
  return null;
}

// ── list ────────────────────────────────────────────────────────────────────

export async function listTeam(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  const admins = await db.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  return ok({ admins });
}

// ── add ─────────────────────────────────────────────────────────────────────

export interface AddTeamMemberBody {
  name: string;
  email: string;
  role: string;
}

/** Validation + duplicate check shared by add and its preview. */
async function checkAdd(
  db: TenantPrisma,
  actor: AdminActor,
  body: AddTeamMemberBody,
): Promise<ServiceFail | { normalizedEmail: string }> {
  const denied = teamManageDenied(actor);
  if (denied) return denied;

  const { name, email, role } = body;

  if (!name || !email || !role) {
    return fail(400, "Name, email, and role are required");
  }

  if (!["SUPER_ADMIN", "ADMIN", "EDITOR"].includes(role)) {
    return fail(400, "Invalid role");
  }
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    return fail(403, "Only a SUPER_ADMIN can make someone a SUPER_ADMIN." + (actor.isApiKey ? API_KEY_NOTE : ""));
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db.adminUser.findFirst({ where: { email: normalizedEmail } });
  if (existing) {
    return fail(409, "An admin with this email already exists");
  }
  return { normalizedEmail };
}

export async function addTeamMember(
  db: TenantPrisma,
  actor: TeamActor,
  body: AddTeamMemberBody,
): Promise<ServiceResult<unknown>> {
  const checked = await checkAdd(db, actor, body);
  if ("ok" in checked) return checked;
  const { normalizedEmail } = checked;
  const { name, role } = body;

  const newAdmin = await db.adminUser.create({
    data: {
      tenantId: db.$tenantId,
      name,
      email: normalizedEmail,
      role: role as "SUPER_ADMIN" | "ADMIN" | "EDITOR",
      isActive: true,
    },
    select: MEMBER_SELECT,
  });

  // Email the invite for THIS store (its host and branding). The member exists
  // either way; `invite.sent` says truthfully whether the email went out.
  const invite = await sendAdminInvite({
    tenantId: db.$tenantId,
    adminId: newAdmin.id,
    email: normalizedEmail,
    role,
    inviterName: actor.name,
  });

  return ok({ admin: newAdmin, invite }, 201);
}

export async function previewAddTeamMember(
  db: TenantPrisma,
  actor: AdminActor,
  body: AddTeamMemberBody,
): Promise<ServiceResult<unknown>> {
  const checked = await checkAdd(db, actor, body);
  if ("ok" in checked) return checked;
  const base = await adminBaseUrlForTenant(db.$tenantId);
  return ok({
    action: "add_admin",
    member: { name: body.name, email: checked.normalizedEmail, role: body.role, isActive: true },
    grants: body.role === "SUPER_ADMIN"
      ? "SUPER_ADMIN: store owner. Full access, including managing other SUPER_ADMINs."
      : body.role === "ADMIN"
      ? "ADMIN: full store admin access, including managing other ADMIN/EDITOR members."
      : "EDITOR: store admin access without team management.",
    inviteEmail: {
      to: checked.normalizedEmail,
      kind: "Admin sign-in link (valid 7 days), branded for this store",
      signInHost: base ? new URL(base).host : null,
      note: "The member is created even if the email fails; the result reports invite.sent.",
    },
  });
}

// ── update ──────────────────────────────────────────────────────────────────

export interface UpdateTeamMemberBody {
  role?: string;
  isActive?: boolean;
}

async function checkUpdate(
  db: TenantPrisma,
  actor: AdminActor,
  id: string,
  body: UpdateTeamMemberBody,
) {
  const denied = teamManageDenied(actor);
  if (denied) return denied;

  const { role } = body;

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) {
    return fail(404, "Admin not found");
  }

  if (role !== undefined && !["SUPER_ADMIN", "ADMIN", "EDITOR"].includes(role)) {
    return fail(400, "Invalid role");
  }
  const ruled = ownerRuleDenied(actor, target, body);
  if (ruled) return ruled;
  if (dropsActiveOwner(target, body) && (await otherActiveOwners(db, db.$tenantId, target.id)) === 0) {
    return fail(409, LAST_OWNER);
  }
  return { target };
}

export async function updateTeamMember(
  db: TenantPrisma,
  actor: AdminActor,
  id: string,
  body: UpdateTeamMemberBody,
): Promise<ServiceResult<unknown>> {
  const checked = await checkUpdate(db, actor, id, body);
  if ("ok" in checked) return checked;
  const { role, isActive } = body;

  const r = await lockedTeamWrite(db, actor, id, { role, isActive }, (tx) =>
    tx.adminUser.update({
      where: { id },
      data: {
        ...(role !== undefined && { role: role as "SUPER_ADMIN" | "ADMIN" | "EDITOR" }),
        ...(isActive !== undefined && { isActive }),
      },
      select: MEMBER_SELECT,
    }),
  );
  if (!r.ok) return r;
  return ok({ admin: r.data });
}

export async function previewUpdateTeamMember(
  db: TenantPrisma,
  actor: AdminActor,
  id: string,
  body: UpdateTeamMemberBody,
): Promise<ServiceResult<unknown>> {
  if (body.role === undefined && body.isActive === undefined) {
    return fail(400, "Nothing to change: provide role and/or isActive");
  }
  const checked = await checkUpdate(db, actor, id, body);
  if ("ok" in checked) return checked;
  const { target } = checked;

  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  if (body.role !== undefined && body.role !== target.role) {
    changes.push({ field: "role", before: target.role, after: body.role });
  }
  if (body.isActive !== undefined && body.isActive !== target.isActive) {
    changes.push({ field: "isActive", before: target.isActive, after: body.isActive });
  }
  const warnings: string[] = [];
  if (body.isActive === false && target.isActive) warnings.push(`${target.email} will no longer be able to sign in to the admin.`);
  if (target.role === "SUPER_ADMIN" && body.isActive === false) warnings.push("Target is a SUPER_ADMIN (store owner).");
  if (body.role === "SUPER_ADMIN" && target.role !== "SUPER_ADMIN") warnings.push(`${target.email} becomes a store owner, with full access including managing other owners.`);

  return ok({
    action: "update_admin",
    member: { id: target.id, name: target.name, email: target.email, role: target.role, isActive: target.isActive },
    changes,
    ...(changes.length === 0 ? { note: "Values already match; nothing would change." } : {}),
    ...(warnings.length ? { warnings } : {}),
    sendsEmail: false,
  });
}

// ── remove ──────────────────────────────────────────────────────────────────

async function checkRemove(db: TenantPrisma, actor: AdminActor, id: string) {
  const denied = teamRemoveDenied(actor);
  if (denied) return denied;

  if (actor.id === id) {
    return fail(400, "Cannot remove yourself. Another SUPER_ADMIN has to do it.");
  }

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) {
    return fail(404, "Admin not found");
  }
  if (dropsActiveOwner(target, { remove: true }) && (await otherActiveOwners(db, db.$tenantId, target.id)) === 0) {
    return fail(409, LAST_OWNER);
  }
  return { target };
}

export async function removeTeamMember(
  db: TenantPrisma,
  actor: AdminActor,
  id: string,
): Promise<ServiceResult<unknown>> {
  const checked = await checkRemove(db, actor, id);
  if ("ok" in checked) return checked;

  const r = await lockedTeamWrite(db, actor, id, { remove: true }, (tx) => tx.adminUser.delete({ where: { id } }));
  if (!r.ok) return r;
  return ok({ success: true });
}

export async function previewRemoveTeamMember(
  db: TenantPrisma,
  actor: AdminActor,
  id: string,
): Promise<ServiceResult<unknown>> {
  const checked = await checkRemove(db, actor, id);
  if ("ok" in checked) return checked;
  const { target } = checked;
  return ok({
    action: "remove_admin",
    member: { id: target.id, name: target.name, email: target.email, role: target.role, isActive: target.isActive },
    effect: "The admin account is permanently deleted and loses all admin access. This cannot be undone (re-adding sends a new invite).",
    sendsEmail: false,
  });
}
