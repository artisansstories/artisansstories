/**
 * Link Hub (house-only): settings, links CRUD, reorder, analytics — admin
 * routes, MCP tools, and the public /links page + click endpoint that read and
 * write the same rows.
 */
import { describe, it, expect } from "vitest";
import { Client } from "pg";
import { isValidElement, type ReactNode } from "react";
import { NextRequest } from "next/server";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import * as settingsRoute from "@/app/api/admin/linktree/settings/route";
import * as linksRoute from "@/app/api/admin/linktree/links/route";
import * as reorderRoute from "@/app/api/admin/linktree/links/reorder/route";
import * as analyticsRoute from "@/app/api/admin/linktree/analytics/route";
import * as clickRoute from "@/app/api/links/click/route";
import LinktreePage from "@/app/links/page";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw pg rows / parsed JSON
type Row = Record<string, any>;

async function sql<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

const linkRow = async (id: string) => (await sql(`SELECT * FROM "LinkTreeLink" WHERE id = $1`, [id]))[0];
const settingsRow = async (tenantId: string) => (await sql(`SELECT * FROM "LinkTreeSettings" WHERE "tenantId" = $1`, [tenantId]))[0];

/** What the public /links page renders: TrackedLink props, in order (no DOM render needed). */
async function publicLinks(): Promise<{ linkId: string; title: string; href: string }[] | null> {
  const tree = await LinktreePage();
  const out: { linkId: string; title: string; href: string }[] = [];
  let comingSoon = false;
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "string" && n.includes("Link hub coming soon")) comingSoon = true;
    if (!isValidElement(n)) return;
    const p = n.props as Row;
    if (typeof p.linkId === "string") out.push({ linkId: p.linkId, title: p.title, href: p.href });
    walk(p.children as ReactNode);
  };
  walk(tree);
  return comingSoon ? null : out;
}

const linkIds = (links: Row[]) => links.map((l) => l.id);

// ── settings ────────────────────────────────────────────────────────────────

describe("Link Hub settings routes", () => {
  it("GET: 401 without session, 403 for the other store, seeded house settings", async () => {
    expect((await call(settingsRoute.GET as never, "GET", "/api/admin/linktree/settings")).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(settingsRoute.GET as never, "GET", "/api/admin/linktree/settings")).status).toBe(403);
    await signInAs(F.admin.super);
    const r = await call(settingsRoute.GET as never, "GET", "/api/admin/linktree/settings");
    expect(r.status).toBe(200);
    expect(r.body.settings).toMatchObject({ tenantId: HOUSE, isEnabled: true, profileName: "Artisans Stories", profileBio: "Handmade in El Salvador" });
  });

  it("POST saves; read back via GET, linktree_settings_get, and the public page", async () => {
    await signInAs(F.admin.super);
    const body = {
      isEnabled: true,
      profileName: "AS Links",
      profileBio: "",
      profileImageUrl: "",
      customSlug: "as",
      backgroundColor: "#000000",
      buttonColor: "#111111",
      textColor: "#FFFFFF",
    };
    const r = await call(settingsRoute.POST as never, "POST", "/api/admin/linktree/settings", { body });
    expect(r.status).toBe(200);
    expect(r.body.settings).toMatchObject({ tenantId: HOUSE, profileName: "AS Links", profileBio: null, customSlug: "as", backgroundColor: "#000000" });
    expect((await call(settingsRoute.GET as never, "GET", "/api/admin/linktree/settings")).body.settings).toMatchObject({ profileName: "AS Links", customSlug: "as" });
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect((await mcp.call("linktree_settings_get")).settings).toMatchObject({ profileName: "AS Links", textColor: "#FFFFFF" });
    await mcp.close();
    // Still exactly one row for the house store.
    expect(await sql(`SELECT id FROM "LinkTreeSettings" WHERE "tenantId" = $1`, [HOUSE])).toHaveLength(1);

    // Unpublish → public page shows "coming soon".
    await call(settingsRoute.POST as never, "POST", "/api/admin/linktree/settings", { body: { ...body, isEnabled: false } });
    expect(await publicLinks()).toBeNull();
  });

  it("POST creates the row when the store has none yet", async () => {
    await sql(`DELETE FROM "LinkTreeSettings" WHERE "tenantId" = $1`, [HOUSE]);
    await signInAs(F.admin.super);
    expect((await call(settingsRoute.GET as never, "GET", "/api/admin/linktree/settings")).body).toEqual({ settings: null });
    const r = await call(settingsRoute.POST as never, "POST", "/api/admin/linktree/settings", {
      body: { isEnabled: true, profileName: "Fresh", backgroundColor: "#FFFBF0", buttonColor: "#8B6914", textColor: "#1F2937" },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await settingsRow(HOUSE))).toMatchObject({ profileName: "Fresh", isEnabled: true });
  });

  it("POST: 401 without session; 403 for the other store, nothing written", async () => {
    const body = { isEnabled: true, profileName: "Hijack" };
    expect((await call(settingsRoute.POST as never, "POST", "/api/admin/linktree/settings", { body })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(settingsRoute.POST as never, "POST", "/api/admin/linktree/settings", { body })).status).toBe(403);
    expect((await settingsRow(HOUSE)).profileName).toBe("Artisans Stories");
    expect(await settingsRow(OTHER)).toBeUndefined();
  });
});

describe("Link Hub settings MCP", () => {
  it("linktree_settings_get returns seeded settings", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect((await mcp.call("linktree_settings_get")).settings).toMatchObject({ tenantId: HOUSE, isEnabled: true, profileBio: "Handmade in El Salvador" });
    await mcp.close();
  });

  it("linktree_settings_update: preview (no change) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "linktree_settings_update", { profileBio: "Hecho a mano", buttonColor: "#222222" }, async (p) => {
      expect(p.preview.createsRow).toBe(false);
      expect(p.preview.changes.profileBio).toEqual({ before: "Handmade in El Salvador", after: "Hecho a mano" });
      expect(p.preview.changedFields).toEqual(expect.arrayContaining(["profileBio", "buttonColor"]));
      expect((await settingsRow(HOUSE)).profileBio).toBe("Handmade in El Salvador");
    });
    expect(expectConfirmed(flow).settings).toMatchObject({ profileBio: "Hecho a mano", buttonColor: "#222222", profileName: "Artisans Stories", isEnabled: true });
    expectReplayBlocked(flow);
    expect((await mcp.call("linktree_settings_get")).settings).toMatchObject({ profileBio: "Hecho a mano", buttonColor: "#222222", profileName: "Artisans Stories" });
    await signInAs(F.admin.super);
    expect((await call(settingsRoute.GET as never, "GET", "/api/admin/linktree/settings")).body.settings.profileBio).toBe("Hecho a mano");
    await mcp.close();
  });

  it("linktree_settings_update publish toggle hides the public page", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await publicLinks()).not.toBeNull();
    expectConfirmed(await previewConfirmReplay(mcp, "linktree_settings_update", { isEnabled: false }));
    expect(await publicLinks()).toBeNull();
    await mcp.close();
  });
});

// ── links CRUD ──────────────────────────────────────────────────────────────

describe("Link Hub links routes", () => {
  it("GET: 401 / 403 / house links in sortOrder (never the other store's)", async () => {
    expect((await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).status).toBe(403);
    await signInAs(F.admin.super);
    const r = await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links");
    expect(r.status).toBe(200);
    expect(linkIds(r.body.links)).toEqual([F.link.shop, F.link.insta]);
    expect(r.body.links[0]).toMatchObject({ title: "Shop", url: "https://artisansstories.com/shop", clicks: 2, isEnabled: true });
  });

  it("public /links page shows the same enabled links in order", async () => {
    expect(await publicLinks()).toEqual([
      { linkId: F.link.shop, title: "Shop", href: "https://artisansstories.com/shop" },
      { linkId: F.link.insta, title: "Instagram", href: "https://instagram.com/artisansstories" },
    ]);
  });

  it("POST creates an enabled link at the bottom; visible via GET, MCP list, and public page", async () => {
    await signInAs(F.admin.super);
    const r = await call(linksRoute.POST as never, "POST", "/api/admin/linktree/links", {
      body: { title: "Blog", url: "https://artisansstories.com/blog", description: "Stories", icon: "📖" },
    });
    expect(r.status).toBe(200);
    expect(r.body.link).toMatchObject({ tenantId: HOUSE, title: "Blog", description: "Stories", icon: "📖", isEnabled: true, sortOrder: 2, clicks: 0 });
    const id = r.body.link.id;
    expect(linkIds((await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).body.links)).toEqual([F.link.shop, F.link.insta, id]);
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(linkIds((await mcp.call("linktree_links_list")).links)).toEqual([F.link.shop, F.link.insta, id]);
    await mcp.close();
    expect((await publicLinks())!.map((l) => l.linkId)).toEqual([F.link.shop, F.link.insta, id]);
  });

  it("POST without title/url → 400, nothing created", async () => {
    await signInAs(F.admin.super);
    const r = await call(linksRoute.POST as never, "POST", "/api/admin/linktree/links", { body: { url: "https://x.test" } });
    expect(r.status).toBe(400);
    const r2 = await call(linksRoute.POST as never, "POST", "/api/admin/linktree/links", { body: { title: "No url" } });
    expect(r2.status).toBe(400);
    expect(await sql(`SELECT id FROM "LinkTreeLink" WHERE "tenantId" = $1`, [HOUSE])).toHaveLength(2);
  });

  it("PUT updates title/isEnabled; disabled link disappears from the public page", async () => {
    await signInAs(F.admin.super);
    const r = await call(linksRoute.PUT as never, "PUT", "/api/admin/linktree/links", {
      body: { id: F.link.insta, title: "IG", isEnabled: false },
    });
    expect(r.status).toBe(200);
    expect(r.body.link).toMatchObject({ id: F.link.insta, title: "IG", url: "https://instagram.com/artisansstories", isEnabled: false });
    const listed = (await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).body.links;
    expect(listed.find((l: Row) => l.id === F.link.insta)).toMatchObject({ title: "IG", isEnabled: false });
    expect((await publicLinks())!.map((l) => l.linkId)).toEqual([F.link.shop]);
  });

  it("PUT unknown id or the OTHER store's link → 404, other store's link untouched", async () => {
    await signInAs(F.admin.super);
    const unknown = await call(linksRoute.PUT as never, "PUT", "/api/admin/linktree/links", { body: { id: "nope", title: "x" } });
    expect(unknown.status).toBe(404);
    const cross = await call(linksRoute.PUT as never, "PUT", "/api/admin/linktree/links", { body: { id: F.link.other, title: "Hijacked", isEnabled: false } });
    expect(cross.status).toBe(404);
    expect(await linkRow(F.link.other)).toMatchObject({ title: "Other Link", isEnabled: true, tenantId: OTHER });
  });

  it("DELETE removes the link and its click logs; 404 for unknown / other store's id; 400 without id", async () => {
    await signInAs(F.admin.super);
    const missing = await call(linksRoute.DELETE as never, "DELETE", "/api/admin/linktree/links");
    expect(missing.status).toBe(400);
    expect((await call(linksRoute.DELETE as never, "DELETE", "/api/admin/linktree/links", { query: { id: "nope" } })).status).toBe(404);
    expect((await call(linksRoute.DELETE as never, "DELETE", "/api/admin/linktree/links", { query: { id: F.link.other } })).status).toBe(404);
    expect(await linkRow(F.link.other)).toBeTruthy();

    const r = await call(linksRoute.DELETE as never, "DELETE", "/api/admin/linktree/links", { query: { id: F.link.shop } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(linkIds((await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).body.links)).toEqual([F.link.insta]);
    expect(await sql(`SELECT id FROM "LinkTreeClickLog" WHERE "linkId" = $1`, [F.link.shop])).toHaveLength(0);
  });

  it("POST/PUT/DELETE: 401 without session, 403 for the other store, nothing changes", async () => {
    const attempts = async () => [
      (await call(linksRoute.POST as never, "POST", "/api/admin/linktree/links", { body: { title: "x", url: "https://x.test" } })).status,
      (await call(linksRoute.PUT as never, "PUT", "/api/admin/linktree/links", { body: { id: F.link.other, title: "x" } })).status,
      (await call(linksRoute.DELETE as never, "DELETE", "/api/admin/linktree/links", { query: { id: F.link.other } })).status,
    ];
    expect(await attempts()).toEqual([401, 401, 401]);
    await signInAs(F.admin.oSuper);
    expect(await attempts()).toEqual([403, 403, 403]);
    expect(await linkRow(F.link.other)).toMatchObject({ title: "Other Link" });
    expect(await sql(`SELECT id FROM "LinkTreeLink"`)).toHaveLength(3);
  });
});

describe("Link Hub links MCP", () => {
  it("linktree_links_list returns house links in order with click counts", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("linktree_links_list");
    expect(r.links.map((l: Row) => [l.id, l.title, l.clicks])).toEqual([
      [F.link.shop, "Shop", 2],
      [F.link.insta, "Instagram", 0],
    ]);
    await mcp.close();
  });

  it("linktree_link_create: preview (no row) → confirm → replay blocked (no duplicate) → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const args = { title: "Press", url: "https://artisansstories.com/press", icon: "📰" };
    const flow = await previewConfirmReplay(mcp, "linktree_link_create", args, async (p) => {
      expect(p.preview.willCreate).toMatchObject({ title: "Press", position: 3, isEnabled: true });
      expect(await sql(`SELECT id FROM "LinkTreeLink" WHERE "tenantId" = $1`, [HOUSE])).toHaveLength(2);
    });
    const link = expectConfirmed(flow).link;
    expect(link).toMatchObject({ title: "Press", sortOrder: 2, tenantId: HOUSE });
    expectReplayBlocked(flow);
    expect(await sql(`SELECT id FROM "LinkTreeLink" WHERE "tenantId" = $1`, [HOUSE])).toHaveLength(3);
    expect(linkIds((await mcp.call("linktree_links_list")).links)).toEqual([F.link.shop, F.link.insta, link.id]);
    await mcp.close();
  });

  it("linktree_link_update: partial update keeps description; preview → confirm → replay → read back", async () => {
    await sql(`UPDATE "LinkTreeLink" SET description = 'Our shop' WHERE id = $1`, [F.link.shop]);
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "linktree_link_update", { linkId: F.link.shop, title: "Store" }, async (p) => {
      expect(p.preview.changes).toEqual({ title: { before: "Shop", after: "Store" } });
      expect((await linkRow(F.link.shop)).title).toBe("Shop");
    });
    expect(expectConfirmed(flow).link).toMatchObject({ title: "Store", description: "Our shop" });
    expectReplayBlocked(flow);
    const shop = (await mcp.call("linktree_links_list")).links.find((l: Row) => l.id === F.link.shop);
    expect(shop).toMatchObject({ title: "Store", description: "Our shop", url: "https://artisansstories.com/shop" });
    await mcp.close();
  });

  it("linktree_link_update / delete: unknown id and OTHER store's link → 404, untouched", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    for (const linkId of ["nope", F.link.other]) {
      expect(await mcp.call("linktree_link_update", { linkId, title: "x" })).toMatchObject({ done: false, blocked: true, status: 404 });
      expect(await mcp.call("linktree_link_delete", { linkId })).toMatchObject({ done: false, blocked: true, status: 404 });
    }
    expect(await linkRow(F.link.other)).toMatchObject({ title: "Other Link" });
    await mcp.close();
  });

  it("linktree_link_delete: preview shows click logs → confirm → replay blocked → gone", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "linktree_link_delete", { linkId: F.link.shop }, async (p) => {
      expect(p.preview).toMatchObject({ willDelete: { id: F.link.shop, title: "Shop", clicks: 2 }, clickLogRows: 2 });
      expect(await linkRow(F.link.shop)).toBeTruthy();
    });
    expect(expectConfirmed(flow)).toEqual({ success: true });
    expect(flow.replay).toMatchObject({ done: false, blocked: true });
    expect(await linkRow(F.link.shop)).toBeUndefined();
    expect(linkIds((await mcp.call("linktree_links_list")).links)).toEqual([F.link.insta]);
    await mcp.close();
  });
});

// ── reorder ─────────────────────────────────────────────────────────────────

describe("Link Hub reorder", () => {
  it("route: new order via GET, MCP list and public page; other store's link untouched", async () => {
    await signInAs(F.admin.super);
    const r = await call(reorderRoute.POST as never, "POST", "/api/admin/linktree/links/reorder", {
      body: { linkIds: [F.link.insta, F.link.shop, F.link.other] },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(linkIds((await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).body.links)).toEqual([F.link.insta, F.link.shop]);
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(linkIds((await mcp.call("linktree_links_list")).links)).toEqual([F.link.insta, F.link.shop]);
    await mcp.close();
    expect((await publicLinks())!.map((l) => l.linkId)).toEqual([F.link.insta, F.link.shop]);
    // The other store's link (passed in at index 2) keeps its sortOrder.
    expect((await linkRow(F.link.other)).sortOrder).toBe(0);
  });

  it("route: bad body → 400; 401 without session; 403 for the other store", async () => {
    await signInAs(F.admin.super);
    expect((await call(reorderRoute.POST as never, "POST", "/api/admin/linktree/links/reorder", { body: {} })).status).toBe(400);
    expect((await call(reorderRoute.POST as never, "POST", "/api/admin/linktree/links/reorder", { body: { linkIds: "x" } })).status).toBe(400);
    const { signOut } = await import("../helpers/session");
    signOut();
    const body = { linkIds: [F.link.insta, F.link.shop] };
    expect((await call(reorderRoute.POST as never, "POST", "/api/admin/linktree/links/reorder", { body })).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(reorderRoute.POST as never, "POST", "/api/admin/linktree/links/reorder", { body })).status).toBe(403);
    expect((await linkRow(F.link.shop)).sortOrder).toBe(0);
  });

  it("MCP linktree_links_reorder: preview (no change) → confirm → replay → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "linktree_links_reorder", { linkIds: [F.link.insta, F.link.shop] }, async (p) => {
      expect(p.preview.before.map((l: Row) => l.id)).toEqual([F.link.shop, F.link.insta]);
      expect(p.preview.after.map((l: Row) => l.id)).toEqual([F.link.insta, F.link.shop]);
      expect((await linkRow(F.link.shop)).sortOrder).toBe(0);
    });
    expect(expectConfirmed(flow)).toEqual({ success: true });
    expectReplayBlocked(flow);
    expect(linkIds((await mcp.call("linktree_links_list")).links)).toEqual([F.link.insta, F.link.shop]);
    await signInAs(F.admin.super);
    expect(linkIds((await call(linksRoute.GET as never, "GET", "/api/admin/linktree/links")).body.links)).toEqual([F.link.insta, F.link.shop]);
    await mcp.close();
  });

  it("MCP reorder refuses incomplete, duplicate, or foreign id lists", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    expect(await mcp.call("linktree_links_reorder", { linkIds: [F.link.insta] })).toMatchObject({ blocked: true, status: 400, missingIds: [F.link.shop] });
    expect(await mcp.call("linktree_links_reorder", { linkIds: [F.link.insta, F.link.shop, F.link.other] })).toMatchObject({ blocked: true, status: 400, unknownIds: [F.link.other] });
    expect(await mcp.call("linktree_links_reorder", { linkIds: [F.link.shop, F.link.shop, F.link.insta] })).toMatchObject({ blocked: true, status: 400, duplicateIds: [F.link.shop] });
    expect((await linkRow(F.link.shop)).sortOrder).toBe(0);
    await mcp.close();
  });
});

// ── analytics ───────────────────────────────────────────────────────────────

describe("Link Hub analytics", () => {
  it("route: 401 / 403 / counts from seeded click logs", async () => {
    expect((await call(analyticsRoute.GET as never, "GET", "/api/admin/linktree/analytics")).status).toBe(401);
    await signInAs(F.admin.oSuper);
    expect((await call(analyticsRoute.GET as never, "GET", "/api/admin/linktree/analytics")).status).toBe(403);
    await signInAs(F.admin.super);
    const r = await call(analyticsRoute.GET as never, "GET", "/api/admin/linktree/analytics");
    expect(r.status).toBe(200);
    expect(r.body.totalAllTime).toBe(2);
    expect(r.body.linkClicks.map((l: Row) => [l.id, l.clicks, Number(l.recent_clicks)])).toEqual([
      [F.link.shop, 2, 1], // 1 click in the last 7 days, 1 older
      [F.link.insta, 0, 0],
    ]);
    expect(r.body.recentLog.map((l: Row) => l.id)).toEqual([F.click.one, F.click.two]);
    expect(r.body.recentLog[0]).toMatchObject({ linkTitle: "Shop", referrer: "instagram.com" });
    expect(r.body.dailyTotals).toHaveLength(1);
    expect(Number(r.body.dailyTotals[0].clicks)).toBe(1);
  });

  it("MCP linktree_analytics: same counts, IP addresses stripped", async () => {
    await sql(`UPDATE "LinkTreeClickLog" SET ip = '203.0.113.9' WHERE id = $1`, [F.click.one]);
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("linktree_analytics");
    expect(r.totalAllTime).toBe(2);
    expect(r.linkClicks.find((l: Row) => l.id === F.link.shop)).toMatchObject({ clicks: 2 });
    expect(r.recentLog).toHaveLength(2);
    for (const row of r.recentLog) expect(row).not.toHaveProperty("ip");
    expect(JSON.stringify(r)).not.toContain("203.0.113.9");
    await mcp.close();
  });

  it("a public click is counted in analytics; a click on another store's link id is ignored", async () => {
    const click = (linkId: string) =>
      clickRoute.POST(new NextRequest("https://artisansstories.com/api/links/click", {
        method: "POST",
        headers: { host: "artisansstories.com", "content-type": "application/json", referer: "https://t.co/x" },
        body: JSON.stringify({ linkId }),
      }));
    expect((await click(F.link.insta)).status).toBe(200);
    await click(F.link.other);
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("linktree_analytics");
    expect(r.totalAllTime).toBe(3);
    expect(r.linkClicks.find((l: Row) => l.id === F.link.insta)).toMatchObject({ clicks: 1 });
    expect(r.dailyTotals.reduce((s: number, d: Row) => s + Number(d.clicks), 0)).toBe(2); // seeded recent + insta
    expect(r.recentLog[0]).toMatchObject({ linkTitle: "Instagram", referrer: "https://t.co/x" });
    await mcp.close();
    expect((await linkRow(F.link.other)).clicks).toBe(0);
    expect(await sql(`SELECT id FROM "LinkTreeClickLog" WHERE "linkId" = $1`, [F.link.other])).toHaveLength(0);
  });
});
