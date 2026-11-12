/**
 * admin-services/team.ts — admin team management shared by /api/admin/team/*
 * and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). Role checks
 * live here and take an `actor`, so the route (actor = admin session) and MCP
 * (actor = { id: ctx.actorId, role: ctx.role }) enforce the same rules:
 *   - add / update: SUPER_ADMIN or ADMIN
 *   - remove:       SUPER_ADMIN only, never yourself
 *   - a SUPER_ADMIN's role can never be changed
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

  if (!["ADMIN", "EDITOR"].includes(role)) {
    return fail(400, "Invalid role");
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
      role: role as "ADMIN" | "EDITOR",
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
    grants: body.role === "ADMIN"
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

  // Cannot change SUPER_ADMIN role via UI
  if (role !== undefined && target.role === "SUPER_ADMIN") {
    return fail(403, "Cannot change SUPER_ADMIN role");
  }

  if (role !== undefined && !["ADMIN", "EDITOR"].includes(role)) {
    return fail(400, "Invalid role");
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

  const updated = await db.adminUser.update({
    where: { id },
    data: {
      ...(role !== undefined && { role: role as "ADMIN" | "EDITOR" }),
      ...(isActive !== undefined && { isActive }),
    },
    select: MEMBER_SELECT,
  });

  return ok({ admin: updated });
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
  if (target.id === actor.id) warnings.push("This is your own account.");
  if (target.role === "SUPER_ADMIN" && body.isActive === false) warnings.push("Target is the SUPER_ADMIN (store owner).");

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
    return fail(400, "Cannot remove yourself");
  }

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) {
    return fail(404, "Admin not found");
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

  await db.adminUser.delete({ where: { id } });

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
