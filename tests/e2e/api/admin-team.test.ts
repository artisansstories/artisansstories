/**
 * Admin team: /api/admin/team (GET/POST), /api/admin/team/[id] (PUT/DELETE),
 * the team_* MCP tools, role gates (same refusals as the Team page), and the
 * invite email for a non-house store (sign-in link must land in THAT store).
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
import { signAccessToken } from "@/lib/mcp/tokens";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs, signOut } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { resendState, sentTo } from "../helpers/fakes";
import * as teamRoute from "@/app/api/admin/team/route";
import * as teamIdRoute from "@/app/api/admin/team/[id]/route";
import * as verifyRoute from "@/app/api/auth/admin/verify/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

const HOUSE_TEAM = [F.admin.super, F.admin.admin, F.admin.editor, F.admin.inactive];

const addMember = (body: unknown) => call(teamRoute.POST as never, "POST", "/api/admin/team", { body });
const updateMember = (id: string, body: unknown) => call(teamIdRoute.PUT as never, "PUT", `/api/admin/team/${id}`, { params: { id }, body });
const removeMember = (id: string) => call(teamIdRoute.DELETE as never, "DELETE", `/api/admin/team/${id}`, { params: { id } });
const listRoute = () => call(teamRoute.GET as never, "GET", "/api/admin/team");

/** An MCP connection acting as a real admin user (OAuth access token), so its role is the user's. */
async function connectAsUser(adminId: string): Promise<Mcp> {
  const u = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  return connectMcp(await signAccessToken({ sub: u.id, tenantId: u.tenantId, scope: "mcp:admin" }));
}

function inviteLink(html: string): URL {
  const m = html.match(/href="([^"]*\/api\/auth\/admin\/verify\?token=[^"]+)"/);
  expect(m, "invite email has a verify link").not.toBeNull();
  return new URL(m![1].replace(/&amp;/g, "&"));
}

/**
 * Assert exactly one invite went to `email`, with the store's branding and a
 * link on `host`, backed by an ADMIN MagicLinkToken for `tenantId`; then click it
 * through the real verify route and check the new session lands in that store.
 */
async function expectInviteAndSignIn(email: string, opts: { tenantId: string; host: string; fromName: string; storeName: string; adminId: string }) {
  expect(resendState.sent).toHaveLength(1);
  const [mail] = sentTo(email);
  expect(mail, "invite sent to the new member").toBeTruthy();
  expect(mail.from).toBe(`${opts.fromName} <hello@artisansstories.com>`);
  expect(mail.subject).toBe(`You're invited to the ${opts.storeName} admin`);

  const link = inviteLink(mail.html);
  expect(link.host).toBe(opts.host);
  expect(link.pathname).toBe("/api/auth/admin/verify");
  const token = link.searchParams.get("token")!;
  const row = await prisma.magicLinkToken.findUniqueOrThrow({ where: { token } });
  expect(row).toMatchObject({ tenantId: opts.tenantId, email, type: "ADMIN", usedAt: null });
  expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  expect(await prisma.emailLog.count({ where: { tenantId: opts.tenantId, type: "MAGIC_LINK_ADMIN", toEmail: email, relatedId: opts.adminId } })).toBe(1);

  // Click the link: a fresh browser with no session.
  signOut();
  const res = await call(verifyRoute.GET as never, "GET", link.toString());
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get("location")!);
  expect(location.host).toBe(opts.host);
  expect(location.pathname).toBe("/admin");
  const session = await getAdminSession();
  expect(session).toMatchObject({ id: opts.adminId, email, tenantId: opts.tenantId });
  expect((await prisma.magicLinkToken.findUniqueOrThrow({ where: { token } })).usedAt).not.toBeNull();

  // The new session sees its own store's team, and the link is single-use.
  const team = await listRoute();
  expect(team.status).toBe(200);
  expect(team.body.admins.every((a: any) => a.id === opts.adminId || a.email !== email)).toBe(true);
  expect(team.body.admins.map((a: any) => a.id)).toContain(opts.adminId);
  signOut();
  const again = await call(verifyRoute.GET as never, "GET", link.toString());
  expect(again.headers.get("location")).toContain("error=used");
  expect(await getAdminSession()).toBeNull();
}

// ── GET /api/admin/team + team_list ─────────────────────────────────────────

describe("GET /api/admin/team + team_list", () => {
  it("401 without a session", async () => {
    expect((await listRoute()).status).toBe(401);
  });

  it("lists this store's admins oldest first; team_list matches", async () => {
    await signInAs(F.admin.editor);
    const r = await listRoute();
    expect(r.status).toBe(200);
    expect(r.body.admins.map((a: any) => a.id)).toEqual(HOUSE_TEAM);
    expect(r.body.admins[0]).toEqual({ id: F.admin.super, email: "anna@artisansstories.com", name: "Anna Super", role: "SUPER_ADMIN", isActive: true, createdAt: expect.any(String) });
    expect(r.body.admins.find((a: any) => a.id === F.admin.inactive).isActive).toBe(false);

    const mcp = await connectMcp(KEYS.houseRead);
    expect(await mcp.call("team_list")).toEqual(r.body);
    await mcp.close();

    await signInAs(F.admin.oSuper);
    const o = await listRoute();
    expect(o.body.admins.map((a: any) => a.id)).toEqual([F.admin.oSuper, F.admin.oEditor]);
  });
});

// ── POST /api/admin/team ─────────────────────────────────────────────────────

describe("POST /api/admin/team", () => {
  it("401 without a session, nothing created or sent", async () => {
    const r = await addMember({ name: "X", email: "x@example.test", role: "EDITOR" });
    expect(r.status).toBe(401);
    expect(await prisma.adminUser.count({ where: { email: "x@example.test" } })).toBe(0);
    expect(resendState.sent).toHaveLength(0);
  });

  it("EDITOR is refused (403), nothing created or sent", async () => {
    await signInAs(F.admin.editor);
    const r = await addMember({ name: "X", email: "x@example.test", role: "EDITOR" });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "Forbidden" });
    expect(await prisma.adminUser.count({ where: { email: "x@example.test" } })).toBe(0);
    expect(resendState.sent).toHaveLength(0);
  });

  it("validation: missing fields 400, SUPER_ADMIN role 400, duplicate email 409 (case-insensitive)", async () => {
    await signInAs(F.admin.super);
    expect((await addMember({ name: "X", email: "x@example.test" })).status).toBe(400);
    const sup = await addMember({ name: "X", email: "x@example.test", role: "SUPER_ADMIN" });
    expect(sup).toMatchObject({ status: 400, body: { error: "Invalid role" } });
    const dup = await addMember({ name: "Dup", email: "  EDITOR@ArtisansStories.com ", role: "EDITOR" });
    expect(dup).toMatchObject({ status: 409, body: { error: "An admin with this email already exists" } });
    expect(await prisma.adminUser.count({ where: { tenantId: HOUSE } })).toBe(4);
    expect(resendState.sent).toHaveLength(0);
  });

  it("house store (ADMIN actor): creates the member, invite on the apex host, link signs into HOUSE", async () => {
    await signInAs(F.admin.admin);
    const r = await addMember({ name: "New Helper", email: "  Helper@Example.TEST ", role: "EDITOR" });
    expect(r.status).toBe(201);
    expect(r.body.admin).toMatchObject({ email: "helper@example.test", name: "New Helper", role: "EDITOR", isActive: true });
    expect(r.body.invite).toEqual({ sent: true, to: "helper@example.test", signInHost: "artisansstories.com" });
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: r.body.admin.id } });
    expect(row.tenantId).toBe(HOUSE);
    expect(sentTo("helper@example.test")[0].html).toContain("Adam Admin has added you");
    await expectInviteAndSignIn("helper@example.test", { tenantId: HOUSE, host: "artisansstories.com", fromName: "Artisans' Stories", storeName: "Artisans' Stories", adminId: r.body.admin.id });
  });

  it("OTHER store: one email with Other Store branding, link on its subdomain, signs into OTHER", async () => {
    await signInAs(F.admin.oSuper);
    const r = await addMember({ name: "Gina Glove", email: "gina@other.test", role: "ADMIN" });
    expect(r.status).toBe(201);
    expect(r.body.invite).toEqual({ sent: true, to: "gina@other.test", signInHost: "other-store.artisansstories.com" });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: r.body.admin.id } })).tenantId).toBe(OTHER);
    const html = sentTo("gina@other.test")[0].html;
    expect(html).toContain("#123456"); // email accent from TenantTheme
    expect(html).toContain("Other Store");
    expect(html).not.toContain("Artisans Stories admin");
    // No token was minted for the house store.
    expect(await prisma.magicLinkToken.count({ where: { tenantId: HOUSE } })).toBe(0);
    await expectInviteAndSignIn("gina@other.test", { tenantId: OTHER, host: "other-store.artisansstories.com", fromName: "Other Store Team", storeName: "Other Store", adminId: r.body.admin.id });
  });

  it("the same email can be an admin of both stores; each invite signs into its own store", async () => {
    await signInAs(F.admin.oSuper);
    const r = await addMember({ name: "Eddie Too", email: "editor@artisansstories.com", role: "EDITOR" });
    expect(r.status).toBe(201);
    expect(r.body.invite.sent).toBe(true);
    await expectInviteAndSignIn("editor@artisansstories.com", { tenantId: OTHER, host: "other-store.artisansstories.com", fromName: "Other Store Team", storeName: "Other Store", adminId: r.body.admin.id });
    // The house account with that email is untouched.
    expect(await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.editor } })).toMatchObject({ tenantId: HOUSE, role: "EDITOR" });
  });

  it("Resend failure: member is still created, response says invite.sent false with the error", async () => {
    await signInAs(F.admin.oSuper);
    resendState.failNext = "domain not verified";
    const r = await addMember({ name: "No Mail", email: "nomail@other.test", role: "EDITOR" });
    expect(r.status).toBe(201);
    expect(r.body.invite).toMatchObject({ sent: false, to: "nomail@other.test" });
    expect(r.body.invite.error).toContain("domain not verified");
    expect(resendState.sent).toHaveLength(0);
    expect(await prisma.adminUser.count({ where: { tenantId: OTHER, email: "nomail@other.test" } })).toBe(1);
    expect(await prisma.emailLog.count({ where: { type: "MAGIC_LINK_ADMIN" } })).toBe(0);
  });
});

// ── PUT /api/admin/team/[id] ─────────────────────────────────────────────────

describe("PUT /api/admin/team/[id]", () => {
  it("401 without a session", async () => {
    expect((await updateMember(F.admin.editor, { role: "ADMIN" })).status).toBe(401);
  });

  it("EDITOR is refused (403)", async () => {
    await signInAs(F.admin.editor);
    const r = await updateMember(F.admin.inactive, { isActive: true });
    expect(r.status).toBe(403);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.inactive } })).isActive).toBe(false);
  });

  it("ADMIN changes a role and deactivates; GET shows it", async () => {
    await signInAs(F.admin.admin);
    const r = await updateMember(F.admin.editor, { role: "ADMIN" });
    expect(r.status).toBe(200);
    expect(r.body.admin).toMatchObject({ id: F.admin.editor, role: "ADMIN", isActive: true });
    const d = await updateMember(F.admin.editor, { isActive: false });
    expect(d.body.admin).toMatchObject({ role: "ADMIN", isActive: false });
    const list = await listRoute();
    expect(list.body.admins.find((a: any) => a.id === F.admin.editor)).toMatchObject({ role: "ADMIN", isActive: false });
  });

  it("SUPER_ADMIN's role can't be changed (403); invalid role 400; unknown id 404", async () => {
    await signInAs(F.admin.super);
    expect(await updateMember(F.admin.super, { role: "EDITOR" })).toMatchObject({ status: 403, body: { error: "Cannot change SUPER_ADMIN role" } });
    await signInAs(F.admin.admin);
    expect(await updateMember(F.admin.super, { role: "ADMIN" })).toMatchObject({ status: 403 });
    expect(await updateMember(F.admin.editor, { role: "SUPER_ADMIN" })).toMatchObject({ status: 400, body: { error: "Invalid role" } });
    expect((await updateMember("nope", { role: "ADMIN" })).status).toBe(404);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.super } })).role).toBe("SUPER_ADMIN");
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.editor } })).role).toBe("EDITOR");
  });

  it("another store's admin is 404 (tenant isolation)", async () => {
    await signInAs(F.admin.super);
    expect((await updateMember(F.admin.oEditor, { isActive: false })).status).toBe(404);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.oEditor } })).isActive).toBe(true);
  });
});

// ── DELETE /api/admin/team/[id] ──────────────────────────────────────────────

describe("DELETE /api/admin/team/[id]", () => {
  it("401 without a session", async () => {
    expect((await removeMember(F.admin.editor)).status).toBe(401);
    expect(await prisma.adminUser.count({ where: { id: F.admin.editor } })).toBe(1);
  });

  it("ADMIN and EDITOR are refused (403): only SUPER_ADMIN removes", async () => {
    for (const actor of [F.admin.admin, F.admin.editor]) {
      await signInAs(actor);
      const r = await removeMember(F.admin.inactive);
      expect(r).toMatchObject({ status: 403, body: { error: "Forbidden — only SUPER_ADMIN can remove admins" } });
    }
    expect(await prisma.adminUser.count({ where: { id: F.admin.inactive } })).toBe(1);
  });

  it("nobody can remove themselves", async () => {
    await signInAs(F.admin.super);
    expect(await removeMember(F.admin.super)).toMatchObject({ status: 400, body: { error: "Cannot remove yourself" } });
    expect(await prisma.adminUser.count({ where: { id: F.admin.super } })).toBe(1);
  });

  it("SUPER_ADMIN removes a member; GET no longer lists them", async () => {
    await signInAs(F.admin.super);
    const r = await removeMember(F.admin.editor);
    expect(r).toMatchObject({ status: 200, body: { success: true } });
    const list = await listRoute();
    expect(list.body.admins.map((a: any) => a.id)).toEqual([F.admin.super, F.admin.admin, F.admin.inactive]);
    expect((await removeMember(F.admin.editor)).status).toBe(404);
  });

  it("another store's admin is 404 (tenant isolation)", async () => {
    await signInAs(F.admin.super);
    expect((await removeMember(F.admin.oEditor)).status).toBe(404);
    expect(await prisma.adminUser.count({ where: { id: F.admin.oEditor } })).toBe(1);
  });
});

// ── MCP team_add / team_update / team_remove ─────────────────────────────────

describe("team_add (MCP)", () => {
  it("house key: preview creates nothing and sends nothing → confirm invites → replay blocked", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { name: "Mia Muse", email: "mia@example.test", role: "EDITOR" };
    const flow = await previewConfirmReplay(mcp, "team_add", args, async (p) => {
      expect(p.preview).toMatchObject({ action: "add_admin", member: { email: "mia@example.test", role: "EDITOR" }, inviteEmail: { to: "mia@example.test", signInHost: "artisansstories.com" } });
      expect(await prisma.adminUser.count({ where: { email: "mia@example.test" } })).toBe(0);
      expect(await prisma.magicLinkToken.count()).toBe(0);
      expect(resendState.sent).toHaveLength(0);
    });
    const result = expectConfirmed(flow);
    expect(result.invite).toEqual({ sent: true, to: "mia@example.test", signInHost: "artisansstories.com" });
    expectReplayBlocked(flow);
    expect(resendState.sent).toHaveLength(1);
    expect(await prisma.adminUser.count({ where: { email: "mia@example.test" } })).toBe(1);
    const list = await mcp.call("team_list");
    expect(list.admins.find((a: any) => a.email === "mia@example.test")).toMatchObject({ id: result.admin.id, role: "EDITOR", isActive: true });
    await mcp.close();
    await expectInviteAndSignIn("mia@example.test", { tenantId: HOUSE, host: "artisansstories.com", fromName: "Artisans' Stories", storeName: "Artisans' Stories", adminId: result.admin.id });
  });

  it("OTHER key: Other Store branded invite on other-store host; link signs into OTHER", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    const args = { name: "Kai Key", email: "kai@other.test", role: "ADMIN" };
    const flow = await previewConfirmReplay(mcp, "team_add", args, async (p) => {
      expect(p.preview.inviteEmail.signInHost).toBe("other-store.artisansstories.com");
      expect(resendState.sent).toHaveLength(0);
    });
    const result = expectConfirmed(flow);
    expectReplayBlocked(flow);
    expect(result.invite).toEqual({ sent: true, to: "kai@other.test", signInHost: "other-store.artisansstories.com" });
    expect(result.admin).toMatchObject({ email: "kai@other.test", role: "ADMIN" });
    await mcp.close();
    await expectInviteAndSignIn("kai@other.test", { tenantId: OTHER, host: "other-store.artisansstories.com", fromName: "Other Store Team", storeName: "Other Store", adminId: result.admin.id });
  });

  it("Resend failure is reported as invite.sent false (never a false success)", async () => {
    const mcp = await connectMcp(KEYS.otherAdmin);
    const args = { name: "Fail Mail", email: "fail@other.test", role: "EDITOR" };
    const preview = await mcp.call("team_add", args);
    resendState.failNext = "rate limited";
    const confirmed = await mcp.call("team_add", { ...args, confirmToken: preview.confirmToken });
    expect(confirmed).toMatchObject({ done: true, result: { invite: { sent: false, to: "fail@other.test" } } });
    expect(confirmed.result.invite.error).toContain("rate limited");
    expect(await prisma.adminUser.count({ where: { tenantId: OTHER, email: "fail@other.test" } })).toBe(1);
    await mcp.close();
  });

  it("duplicate email is refused at preview (409)", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("team_add", { name: "Dup", email: "admin@artisansstories.com", role: "EDITOR" })).toMatchObject({ done: false, blocked: true, status: 409 });
    await mcp.close();
  });

  it("an EDITOR signed in over OAuth gets the same 403 as the Team page", async () => {
    const mcp = await connectAsUser(F.admin.editor);
    const r = await mcp.call("team_add", { name: "X", email: "x@example.test", role: "EDITOR" });
    expect(r).toMatchObject({ done: false, blocked: true, status: 403, reason: "Forbidden" });
    const u = await mcp.call("team_update", { adminId: F.admin.inactive, isActive: true });
    expect(u).toMatchObject({ blocked: true, status: 403 });
    expect(await prisma.adminUser.count({ where: { email: "x@example.test" } })).toBe(0);
    await mcp.close();
  });
});

describe("team_update (MCP)", () => {
  it("preview → confirm → replay blocked → team_list shows the change", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "team_update", { adminId: F.admin.editor, role: "ADMIN", isActive: false }, async (p) => {
      expect(p.preview.changes).toEqual([
        { field: "role", before: "EDITOR", after: "ADMIN" },
        { field: "isActive", before: true, after: false },
      ]);
      expect(await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.editor } })).toMatchObject({ role: "EDITOR", isActive: true });
    });
    expect(expectConfirmed(flow).admin).toMatchObject({ id: F.admin.editor, role: "ADMIN", isActive: false });
    expectReplayBlocked(flow);
    const list = await mcp.call("team_list");
    expect(list.admins.find((a: any) => a.id === F.admin.editor)).toMatchObject({ role: "ADMIN", isActive: false });
    expect(resendState.sent).toHaveLength(0);
    await mcp.close();
  });

  it("SUPER_ADMIN role change refused; other store's admin 404; empty change 400", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("team_update", { adminId: F.admin.super, role: "EDITOR" })).toMatchObject({ blocked: true, status: 403, reason: "Cannot change SUPER_ADMIN role" });
    expect(await mcp.call("team_update", { adminId: F.admin.oEditor, isActive: false })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("team_update", { adminId: F.admin.editor })).toMatchObject({ blocked: true, status: 400 });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.super } })).role).toBe("SUPER_ADMIN");
    await mcp.close();
  });
});

describe("team_remove (MCP)", () => {
  it("an API key acts as ADMIN, so team_remove is refused cleanly (403) and nothing is deleted", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("team_remove", { adminId: F.admin.editor });
    expect(r).toMatchObject({ done: false, blocked: true, status: 403, reason: "Forbidden — only SUPER_ADMIN can remove admins" });
    expect(r.confirmToken).toBeUndefined();
    expect(await prisma.adminUser.count({ where: { id: F.admin.editor } })).toBe(1);
    await mcp.close();
  });

  it("an ADMIN user over OAuth is refused too", async () => {
    const mcp = await connectAsUser(F.admin.admin);
    expect(await mcp.call("team_remove", { adminId: F.admin.editor })).toMatchObject({ blocked: true, status: 403 });
    await mcp.close();
  });

  it("a SUPER_ADMIN over OAuth: preview → confirm → replay blocked → gone; never themselves", async () => {
    const mcp = await connectAsUser(F.admin.super);
    expect(await mcp.call("team_remove", { adminId: F.admin.super })).toMatchObject({ blocked: true, status: 400, reason: "Cannot remove yourself" });
    expect(await mcp.call("team_remove", { adminId: F.admin.oEditor })).toMatchObject({ blocked: true, status: 404 });
    const flow = await previewConfirmReplay(mcp, "team_remove", { adminId: F.admin.inactive }, async (p) => {
      expect(p.preview.member).toMatchObject({ id: F.admin.inactive, email: "gone@artisansstories.com" });
      expect(await prisma.adminUser.count({ where: { id: F.admin.inactive } })).toBe(1);
    });
    expect(expectConfirmed(flow)).toEqual({ success: true });
    expectReplayBlocked(flow);
    const list = await mcp.call("team_list");
    expect(list.admins.map((a: any) => a.id)).toEqual([F.admin.super, F.admin.admin, F.admin.editor]);
    await mcp.close();
  });
});

// ── stale sessions: the session JWT lives 30 days; team gates use the live role ──

describe("team routes re-check the admin live (stale session tokens)", () => {
  it("a deactivated admin's still-valid session can't re-activate itself or manage the team (401)", async () => {
    await signInAs(F.admin.admin);
    await prisma.adminUser.update({ where: { id: F.admin.admin }, data: { isActive: false } });
    expect((await updateMember(F.admin.admin, { isActive: true })).status).toBe(401);
    expect((await addMember({ name: "X", email: "x@example.test", role: "ADMIN" })).status).toBe(401);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.admin } })).isActive).toBe(false);
    expect(await prisma.adminUser.count({ where: { email: "x@example.test" } })).toBe(0);
    expect(resendState.sent).toHaveLength(0);

    await signInAs(F.admin.super);
    await prisma.adminUser.update({ where: { id: F.admin.super }, data: { isActive: false } });
    expect((await removeMember(F.admin.editor)).status).toBe(401);
    expect(await prisma.adminUser.count({ where: { id: F.admin.editor } })).toBe(1);
  });

  it("an admin demoted to EDITOR after signing in is refused (403) like the UI", async () => {
    await signInAs(F.admin.admin);
    await prisma.adminUser.update({ where: { id: F.admin.admin }, data: { role: "EDITOR" } });
    expect((await addMember({ name: "X", email: "x@example.test", role: "ADMIN" })).status).toBe(403);
    expect((await updateMember(F.admin.editor, { role: "ADMIN" })).status).toBe(403);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: F.admin.editor } })).role).toBe("EDITOR");
  });

  it("an EDITOR promoted to ADMIN after signing in gets the new rights", async () => {
    await signInAs(F.admin.editor);
    await prisma.adminUser.update({ where: { id: F.admin.editor }, data: { role: "ADMIN" } });
    const r = await addMember({ name: "Promo", email: "promo@example.test", role: "EDITOR" });
    expect(r.status).toBe(201);
    expect(sentTo("promo@example.test")[0].html).toContain("Eddie Editor has added you");
  });
});
