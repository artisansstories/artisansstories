/* eslint-disable @typescript-eslint/no-explicit-any -- route and tool results are arbitrary JSON. */
/**
 * Owner protection (decision 3) and the publish gate (decision 4), through the
 * team/settings routes AND MCP (API key = ADMIN; OAuth user = their own role),
 * including concurrent requests against the last-owner rule.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mcp/tokens";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import * as teamRoute from "@/app/api/admin/team/route";
import * as teamIdRoute from "@/app/api/admin/team/[id]/route";
import * as settingsRoute from "@/app/api/admin/settings/route";

const updateMember = (id: string, body: unknown) => call(teamIdRoute.PUT as never, "PUT", `/api/admin/team/${id}`, { params: { id }, body });
const removeMember = (id: string) => call(teamIdRoute.DELETE as never, "DELETE", `/api/admin/team/${id}`, { params: { id } });
const addMember = (body: unknown) => call(teamRoute.POST as never, "POST", "/api/admin/team", { body });
const putSettings = (body: unknown) => call(settingsRoute.PUT as never, "PUT", "/api/admin/settings", { body });
const admin = (id: string) => prisma.adminUser.findUniqueOrThrow({ where: { id } });
const activeOwners = () => prisma.adminUser.count({ where: { tenantId: HOUSE, role: "SUPER_ADMIN", isActive: true } });

async function connectAsUser(adminId: string): Promise<Mcp> {
  const u = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  return connectMcp(await signAccessToken({ sub: u.id, tenantId: u.tenantId, scope: "mcp:admin" }));
}
async function withMcp<T>(mcp: Mcp | Promise<Mcp>, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const m = await mcp;
  try {
    return await fn(m);
  } finally {
    await m.close();
  }
}

/** A second house owner, so owner-on-owner actions have someone to act on. */
const SUPER2 = "h_admin_super2";
async function addSecondOwner(isActive = true) {
  await prisma.adminUser.create({ data: { id: SUPER2, tenantId: HOUSE, email: "owner2@artisansstories.com", name: "Second Owner", role: "SUPER_ADMIN", isActive } });
}

// ── nobody acts on themselves ───────────────────────────────────────────────

describe("nobody changes their own role or deactivates/removes themselves", () => {
  it("route: SUPER_ADMIN and ADMIN, each on their own account", async () => {
    for (const id of [F.admin.super, F.admin.admin]) {
      await signInAs(id);
      const role = await updateMember(id, { role: "EDITOR" });
      expect(role).toMatchObject({ status: 403, body: { error: expect.stringContaining("can't change your own role") } });
      const off = await updateMember(id, { isActive: false });
      expect(off).toMatchObject({ status: 403, body: { error: expect.stringContaining("can't deactivate yourself") } });
      expect(await admin(id)).toMatchObject({ isActive: true });
    }
    await signInAs(F.admin.super);
    expect((await removeMember(F.admin.super)).status).toBe(400);
    // Re-sending your own current values is not a change, so it's allowed.
    expect((await updateMember(F.admin.admin, { role: "ADMIN", isActive: true })).status).toBe(200);
  });

  it("MCP over OAuth: the same refusals at preview, no confirm token", async () => {
    await withMcp(connectAsUser(F.admin.admin), async (mcp) => {
      const r = await mcp.call("team_update", { adminId: F.admin.admin, isActive: false });
      expect(r).toMatchObject({ blocked: true, status: 403 });
      expect(r.reason).toContain("can't deactivate yourself");
      expect(r.confirmToken).toBeUndefined();
      expect((await mcp.call("team_update", { adminId: F.admin.admin, role: "EDITOR" })).reason).toContain("can't change your own role");
    });
    expect((await admin(F.admin.admin)).role).toBe("ADMIN");
  });
});

// ── only owners touch owners ────────────────────────────────────────────────

describe("only a SUPER_ADMIN changes, deactivates or removes a SUPER_ADMIN, or grants it", () => {
  it("ADMIN (route) is refused on every owner action; nothing changes", async () => {
    await addSecondOwner();
    await signInAs(F.admin.admin);
    for (const body of [{ role: "ADMIN" }, { isActive: false }]) {
      const r = await updateMember(F.admin.super, body);
      expect(r).toMatchObject({ status: 403, body: { error: "Only a SUPER_ADMIN (store owner) can change, deactivate or remove a SUPER_ADMIN." } });
    }
    expect(await updateMember(F.admin.editor, { role: "SUPER_ADMIN" })).toMatchObject({ status: 403 });
    expect(await addMember({ name: "New", email: "new@example.test", role: "SUPER_ADMIN" })).toMatchObject({ status: 403 });
    expect(await admin(F.admin.super)).toMatchObject({ role: "SUPER_ADMIN", isActive: true });
    expect((await admin(F.admin.editor)).role).toBe("EDITOR");
  });

  it("ADMIN can still manage non-owners (role + deactivate)", async () => {
    await signInAs(F.admin.admin);
    expect((await updateMember(F.admin.editor, { role: "ADMIN" })).status).toBe(200);
    expect((await updateMember(F.admin.editor, { isActive: false })).status).toBe(200);
    expect(await admin(F.admin.editor)).toMatchObject({ role: "ADMIN", isActive: false });
  });

  it("MCP API key (acts as ADMIN): manages ADMIN/EDITOR members, never a SUPER_ADMIN or a grant of SUPER_ADMIN", async () => {
    await addSecondOwner();
    await withMcp(connectMcp(KEYS.houseAdmin), async (mcp) => {
      for (const args of [{ adminId: F.admin.super, isActive: false }, { adminId: SUPER2, role: "EDITOR" }, { adminId: F.admin.editor, role: "SUPER_ADMIN" }]) {
        const r = await mcp.call("team_update", args);
        expect(r, JSON.stringify(args)).toMatchObject({ done: false, blocked: true, status: 403 });
        expect(r.reason).toContain("AI assistant API keys act as ADMIN");
      }
      const add = await mcp.call("team_add", { name: "Boss", email: "boss@example.test", role: "SUPER_ADMIN" });
      expect(add).toMatchObject({ blocked: true, status: 403 });
      expect((await mcp.call("team_remove", { adminId: SUPER2 })).status).toBe(403);
      // Non-owner management works end to end.
      const flow = await previewConfirmReplay(mcp, "team_update", { adminId: F.admin.editor, role: "ADMIN" });
      expect(expectConfirmed(flow).admin).toMatchObject({ id: F.admin.editor, role: "ADMIN" });
      expectReplayBlocked(flow);
    });
    expect(await admin(SUPER2)).toMatchObject({ role: "SUPER_ADMIN", isActive: true });
    expect(await activeOwners()).toBe(2);
  });

  it("a SUPER_ADMIN can promote to SUPER_ADMIN, and demote/deactivate/remove another owner while one remains", async () => {
    await signInAs(F.admin.super);
    const promote = await updateMember(F.admin.admin, { role: "SUPER_ADMIN" });
    expect(promote.status, promote.text).toBe(200);
    expect(await activeOwners()).toBe(2);
    expect((await updateMember(F.admin.admin, { role: "ADMIN" })).status).toBe(200);
    expect((await updateMember(F.admin.admin, { role: "SUPER_ADMIN" })).status).toBe(200);
    expect((await updateMember(F.admin.admin, { isActive: false })).status).toBe(200);
    expect((await removeMember(F.admin.admin)).status).toBe(200);
    expect(await activeOwners()).toBe(1);
    const created = await addMember({ name: "Co Owner", email: "co@example.test", role: "SUPER_ADMIN" });
    expect(created.status).toBe(201);
    expect(created.body.admin.role).toBe("SUPER_ADMIN");
  });

  it("MCP over OAuth as a SUPER_ADMIN: promote preview warns, confirm grants", async () => {
    await withMcp(connectAsUser(F.admin.super), async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "team_update", { adminId: F.admin.admin, role: "SUPER_ADMIN" }, (pv) => {
        expect(pv.preview.changes).toEqual([{ field: "role", before: "ADMIN", after: "SUPER_ADMIN" }]);
        expect(pv.preview.warnings.join(" ")).toContain("becomes a store owner");
      });
      expect(expectConfirmed(flow).admin.role).toBe("SUPER_ADMIN");
    });
  });
});

// ── at least one active owner, always ───────────────────────────────────────

describe("the store always keeps at least one active SUPER_ADMIN", () => {
  it("sequentially the rules already guarantee it: after A demotes B, B can't touch A and A can't act on itself", async () => {
    await addSecondOwner();
    await signInAs(F.admin.super);
    expect((await updateMember(SUPER2, { role: "ADMIN" })).status).toBe(200);
    expect(await activeOwners()).toBe(1);
    await signInAs(SUPER2);
    expect((await updateMember(F.admin.super, { isActive: false })).status).toBe(403);
    expect((await removeMember(F.admin.super)).status).toBe(403);
    await signInAs(F.admin.super);
    expect((await updateMember(F.admin.super, { role: "ADMIN" })).status).toBe(403);
    expect((await updateMember(F.admin.super, { isActive: false })).status).toBe(403);
    expect((await removeMember(F.admin.super)).status).toBe(400);
    expect(await activeOwners()).toBe(1);
  });

  it("defense in depth: the shared service refuses to drop the last active owner (409, next step named), in preview and write", async () => {
    const { getTenantPrisma } = await import("@/lib/tenant-prisma");
    const team = await import("@/lib/admin-services/team");
    const db = getTenantPrisma(HOUSE);
    // An owner-level actor with no admin row of its own, so only the count stands in the way.
    const actor = { id: "external-owner", role: "SUPER_ADMIN", isApiKey: true };
    for (const body of [{ role: "ADMIN" }, { isActive: false }]) {
      const pv = await team.previewUpdateTeamMember(db, actor, F.admin.super, body);
      expect(pv).toMatchObject({ ok: false, status: 409 });
      const w = await team.updateTeamMember(db, actor, F.admin.super, body);
      expect(w).toMatchObject({ ok: false, status: 409 });
      expect((w as any).body.error).toBe("This would leave the store without an active SUPER_ADMIN (owner). Promote someone else to SUPER_ADMIN first (Admin → Team → Change role, or team_update with role SUPER_ADMIN), then try again.");
    }
    expect(await team.removeTeamMember(db, actor, F.admin.super)).toMatchObject({ ok: false, status: 409 });
    expect(await admin(F.admin.super)).toMatchObject({ role: "SUPER_ADMIN", isActive: true });
    // An inactive owner doesn't count as the one that stays.
    await addSecondOwner(false);
    expect(await team.updateTeamMember(db, actor, F.admin.super, { isActive: false })).toMatchObject({ ok: false, status: 409 });
    // With a second ACTIVE owner it goes through.
    await prisma.adminUser.update({ where: { id: SUPER2 }, data: { isActive: true } });
    expect(await team.updateTeamMember(db, actor, F.admin.super, { isActive: false })).toMatchObject({ ok: true });
    expect(await activeOwners()).toBe(1);
  });
});

describe("last-owner rule under concurrency", () => {
  it("two owners deactivate each other at the same time: exactly one succeeds, one active owner remains", async () => {
    await addSecondOwner();
    // Two route calls need two sessions at once; use MCP over OAuth for both actors.
    const a = await connectAsUser(F.admin.super);
    const b = await connectAsUser(SUPER2);
    try {
      const pa = await a.call("team_update", { adminId: SUPER2, isActive: false });
      const pb = await b.call("team_update", { adminId: F.admin.super, isActive: false });
      expect(pa.confirmToken && pb.confirmToken).toBeTruthy();
      const [ra, rb] = await Promise.all([
        a.call("team_update", { adminId: SUPER2, isActive: false, confirmToken: pa.confirmToken }),
        b.call("team_update", { adminId: F.admin.super, isActive: false, confirmToken: pb.confirmToken }),
      ]);
      const done = [ra, rb].filter((r) => r.done === true);
      expect(done, JSON.stringify([ra, rb])).toHaveLength(1);
      const refused = [ra, rb].find((r) => r.done !== true);
      // The loser is refused live: its own account was just deactivated (401), or the count says it would be the last (409).
      expect([401, 409]).toContain(refused.status);
    } finally {
      await a.close();
      await b.close();
    }
    expect(await activeOwners()).toBe(1);
  });

  it("three owners demote each other in a ring at the same time: never zero owners", async () => {
    await addSecondOwner();
    await prisma.adminUser.create({ data: { id: "h_admin_super3", tenantId: HOUSE, email: "owner3@artisansstories.com", name: "Third", role: "SUPER_ADMIN" } });
    const owners = [F.admin.super, SUPER2, "h_admin_super3"];
    // Every owner simultaneously demotes the next one (a ring): naive code ends with zero owners.
    const conns = await Promise.all(owners.map((id) => connectAsUser(id)));
    try {
      const previews = await Promise.all(conns.map((c, i) => c.call("team_update", { adminId: owners[(i + 1) % 3], role: "ADMIN" })));
      const results = await Promise.all(conns.map((c, i) => c.call("team_update", { adminId: owners[(i + 1) % 3], role: "ADMIN", confirmToken: previews[i].confirmToken })));
      // Serialized by the lock: the first demotion wins, the demoted owner is
      // then only an ADMIN (403 on an owner), and the third can still act.
      expect(results.filter((r) => r.done === true).length).toBeLessThanOrEqual(2);
      for (const r of results.filter((x) => x.done !== true)) expect([401, 403, 409]).toContain(r.status);
    } finally {
      await Promise.all(conns.map((c) => c.close()));
    }
    expect(await activeOwners()).toBeGreaterThanOrEqual(1);
  });

  it("route: concurrent remove + demote + deactivate of the other owner → one wins, the acting owner stays", async () => {
    await addSecondOwner();
    await signInAs(F.admin.super);
    const rs = await Promise.all([removeMember(SUPER2), updateMember(SUPER2, { role: "ADMIN" }), updateMember(SUPER2, { isActive: false })]);
    expect(rs.some((r) => r.status === 200)).toBe(true);
    expect(await activeOwners()).toBe(1);
    expect((await admin(F.admin.super))).toMatchObject({ role: "SUPER_ADMIN", isActive: true });
  });
});

// ── decision 4: publishing ──────────────────────────────────────────────────

describe("publishing the store needs ADMIN or SUPER_ADMIN", () => {
  const storeEnabled = async () => (await prisma.storeSettings.findUniqueOrThrow({ where: { id: F.settings.house } })).storeEnabled;

  it("EDITOR: can't flip storeEnabled (403, nothing saved), but saves other fields, including the unchanged storeEnabled", async () => {
    await signInAs(F.admin.editor);
    const before = await storeEnabled();
    const r = await putSettings({ storeName: "Edited", storeEnabled: !before });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/Only an ADMIN or SUPER_ADMIN can take the store live\. Nothing was saved\. Ask an admin to flip "Store status" in Admin → Settings/);
    const row = await prisma.storeSettings.findUniqueOrThrow({ where: { id: F.settings.house } });
    expect(row).toMatchObject({ storeEnabled: before, storeName: "Artisans Stories" });
    // The settings form always sends storeEnabled; unchanged is fine.
    const ok = await putSettings({ storeName: "Edited", storeEnabled: before });
    expect(ok.status).toBe(200);
    expect((await prisma.storeSettings.findUniqueOrThrow({ where: { id: F.settings.house } })).storeName).toBe("Edited");
  });

  it("ADMIN and SUPER_ADMIN publish and unpublish", async () => {
    for (const id of [F.admin.admin, F.admin.super]) {
      await signInAs(id);
      expect((await putSettings({ storeEnabled: true })).status).toBe(200);
      expect(await storeEnabled()).toBe(true);
      expect((await putSettings({ storeEnabled: false })).status).toBe(200);
      expect(await storeEnabled()).toBe(false);
    }
  });

  it("the role is read live: an ADMIN demoted to EDITOR after signing in can't publish", async () => {
    await signInAs(F.admin.admin);
    await prisma.adminUser.update({ where: { id: F.admin.admin }, data: { role: "EDITOR" } });
    expect((await putSettings({ storeEnabled: true })).status).toBe(403);
    expect(await storeEnabled()).toBe(false);
  });

  it("MCP: an API key (ADMIN) publishes; an EDITOR over OAuth is refused at preview", async () => {
    await withMcp(connectMcp(KEYS.houseAdmin), async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "settings_update", { storeEnabled: true }, (pv) => {
        expect(pv.preview.storeVisibility).toMatch(/^PUBLISH/);
      });
      expectConfirmed(flow);
      expectReplayBlocked(flow);
    });
    expect(await storeEnabled()).toBe(true);
    await withMcp(connectAsUser(F.admin.editor), async (mcp) => {
      const r = await mcp.call("settings_update", { storeEnabled: false });
      expect(r).toMatchObject({ done: false, blocked: true, status: 403 });
      expect(r.reason).toContain("Only an ADMIN or SUPER_ADMIN can switch the store back to Coming Soon");
      // Content edits still work for the editor.
      expectConfirmed(await previewConfirmReplay(mcp, "settings_update", { storeDescription: "New words" }));
    });
    expect(await storeEnabled()).toBe(true);
  });
});
