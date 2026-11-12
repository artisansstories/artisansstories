/**
 * Artisans: /api/admin/artisans (GET/POST), /api/admin/artisans/[id] (GET/PUT/DELETE)
 * and the MCP artisans_* tools. Both go through src/lib/admin-services/artisans.ts.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, HOUSE } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import * as list from "@/app/api/admin/artisans/route";
import * as one from "@/app/api/admin/artisans/[id]/route";

const SECRET = "IGSECRET_TOKEN_SHOULD_NEVER_LEAK";
const IG_KEYS = ["igAccessToken", "igUserId", "igTokenExpiry"];

/** No Instagram OAuth field (or the token value) anywhere in a payload. */
function expectNoIgSecrets(payload: unknown) {
  const s = typeof payload === "string" ? payload : JSON.stringify(payload);
  expect(s).not.toContain(SECRET);
  for (const k of IG_KEYS) expect(s).not.toContain(`"${k}"`);
  expect(s).not.toContain("17841400000");
}

const getRoute = (id: string) => call(one.GET as never, "GET", `/api/admin/artisans/${id}`, { params: { id } });
const putRoute = (id: string, body: unknown) => call(one.PUT as never, "PUT", `/api/admin/artisans/${id}`, { params: { id }, body });
const delRoute = (id: string) => call(one.DELETE as never, "DELETE", `/api/admin/artisans/${id}`, { params: { id } });

async function mcpGet(mcp: Mcp, artisanId: string) {
  const r = await mcp.call("artisans_get", { artisanId });
  expectNoIgSecrets(r);
  return r.artisan;
}

/** Exactly the PUT body ArtisanForm.handleSubmit sends (it never sends region,
 * practicingSince, featuredPosts or socialEmbedCode). */
function formBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Maria Hernandez",
    slug: "maria",
    status: "ACTIVE",
    tagline: "Master weaver",
    quote: "",
    story: "",
    heroImageUrl: null,
    avatarUrl: null,
    originCountry: "El Salvador",
    city: "Nahuizalco",
    craft: "Hammocks",
    letterToBuyer: "",
    showGallery: true,
    socialLinksVisible: { instagram: true, facebook: false, tiktok: false, youtube: false, website: false },
    socialLinks: { instagram: "https://instagram.com/maria" },
    storyLabel: "Their Story",
    metaTitle: "",
    metaDescription: "",
    isFeatured: true,
    images: [
      { id: "h_aimg_2", url: "https://cdn.example.test/maria-2.webp", category: "GALLERY", position: 0 },
      { url: "https://cdn.example.test/maria-new.webp", urlThumb: "https://cdn.example.test/maria-new-t.webp", altText: "New", category: "WORKSHOP", position: 1 },
    ],
    ...overrides,
  };
}

describe("artisans routes: auth", () => {
  const cases: [string, () => Promise<{ status: number }>][] = [
    ["GET list", () => call(list.GET as never, "GET", "/api/admin/artisans")],
    ["POST", () => call(list.POST as never, "POST", "/api/admin/artisans", { body: { name: "X" } })],
    ["GET one", () => getRoute(F.artisan.maria)],
    ["PUT", () => putRoute(F.artisan.maria, { name: "Hacked" })],
    ["DELETE", () => delRoute(F.artisan.maria)],
  ];
  for (const [name, run] of cases) {
    it(`${name}: no session → 401`, async () => {
      expect((await run()).status).toBe(401);
    });
    it(`${name}: other store → 403 and nothing changes`, async () => {
      await signInAs(F.admin.oSuper);
      expect((await run()).status).toBe(403);
    });
  }
  it("unauthenticated / non-house calls changed nothing", async () => {
    for (const [, run] of cases) await run();
    await signInAs(F.admin.oSuper);
    for (const [, run] of cases) await run();
    expect(await prisma.artisan.count()).toBe(3);
    expect((await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.maria } })).name).toBe("Maria Hernandez");
  });
});

describe("artisans routes", () => {
  it("GET list: house artisans only, featured first, no Instagram secrets", async () => {
    await signInAs(F.admin.super);
    const r = await call(list.GET as never, "GET", "/api/admin/artisans");
    expect(r.status).toBe(200);
    expect(r.body.artisans.map((a: { id: string }) => a.id)).toEqual([F.artisan.maria, F.artisan.jose]);
    expect(r.body.artisans[0].images).toHaveLength(1);
    expect(r.body.artisans[0].products).toHaveLength(1);
    expectNoIgSecrets(r.text);
  });

  it("GET one: full profile with images and products, no Instagram secrets; bad ids → 404", async () => {
    await signInAs(F.admin.super);
    const r = await getRoute(F.artisan.maria);
    expect(r.status).toBe(200);
    expect(r.body.artisan).toMatchObject({ id: F.artisan.maria, region: "Sonsonate", practicingSince: 1998, socialEmbedCode: "<blockquote>embed</blockquote>" });
    expect(r.body.artisan.images.map((i: { id: string }) => i.id)).toEqual(["h_aimg_1", "h_aimg_2"]);
    expect(r.body.artisan.products[0].product).toMatchObject({ id: F.prod.hammock, slug: "hammock" });
    expectNoIgSecrets(r.text);
    expect((await getRoute("nope")).status).toBe(404);
    expect((await getRoute(F.artisan.other)).status).toBe(404); // other store's artisan
  });

  it("POST: creates a DRAFT with derived slug; read back via GET", async () => {
    await signInAs(F.admin.super);
    const r = await call(list.POST as never, "POST", "/api/admin/artisans", { body: { name: "Rosa María Zamora", craft: "Jewelry", practicingSince: "2005" } });
    expect(r.status).toBe(200);
    expect(r.body.artisan).toMatchObject({ name: "Rosa María Zamora", slug: "rosa-mar-a-zamora", status: "DRAFT", craft: "Jewelry", practicingSince: 2005, originCountry: "El Salvador", tenantId: HOUSE });
    expectNoIgSecrets(r.text);
    const g = await getRoute(r.body.artisan.id);
    expect(g.status).toBe(200);
    expect(g.body.artisan.slug).toBe("rosa-mar-a-zamora");
  });

  it("POST: duplicate slug → 409, missing name → 400 (not 500)", async () => {
    await signInAs(F.admin.super);
    const dup = await call(list.POST as never, "POST", "/api/admin/artisans", { body: { name: "Maria Again", slug: "maria" } });
    expect(dup.status).toBe(409);
    const noName = await call(list.POST as never, "POST", "/api/admin/artisans", { body: { craft: "x" } });
    expect(noName.status).toBe(400);
    expect(await prisma.artisan.count({ where: { tenantId: HOUSE } })).toBe(2);
  });

  it("PUT with the exact admin-form body keeps region, practicingSince, featuredPosts, socialEmbedCode", async () => {
    await signInAs(F.admin.super);
    const r = await putRoute(F.artisan.maria, formBody());
    expect(r.status).toBe(200);
    expectNoIgSecrets(r.text);

    const g = await getRoute(F.artisan.maria);
    expect(g.body.artisan).toMatchObject({
      tagline: "Master weaver",
      region: "Sonsonate",
      practicingSince: 1998,
      featuredPosts: { instagram: ["https://instagram.com/p/abc"], displayCount: 3 },
      socialEmbedCode: "<blockquote>embed</blockquote>",
    });
    // Instagram connection untouched by a profile save.
    const db = await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.maria } });
    expect(db.igAccessToken).toBe(SECRET);

    const mcp = await connectMcp(KEYS.houseAdmin);
    const a = await mcpGet(mcp, F.artisan.maria);
    expect(a).toMatchObject({ region: "Sonsonate", practicingSince: 1998, socialEmbedCode: "<blockquote>embed</blockquote>", featuredPosts: { displayCount: 3 } });
    await mcp.close();
  });

  it("PUT with explicit nulls clears those four fields", async () => {
    await signInAs(F.admin.super);
    const r = await putRoute(F.artisan.maria, { region: null, practicingSince: null, featuredPosts: null, socialEmbedCode: null });
    expect(r.status).toBe(200);
    const g = await getRoute(F.artisan.maria);
    expect(g.body.artisan).toMatchObject({ region: null, practicingSince: null, featuredPosts: null, socialEmbedCode: null, name: "Maria Hernandez", tagline: "Weaver", city: "Nahuizalco" });
    expect(g.body.artisan.images).toHaveLength(2); // images absent → untouched
  });

  it("PUT replaces the gallery in order", async () => {
    await signInAs(F.admin.super);
    await putRoute(F.artisan.maria, formBody());
    const g = await getRoute(F.artisan.maria);
    expect(g.body.artisan.images.map((i: { url: string; category: string; position: number }) => [i.url, i.category, i.position])).toEqual([
      ["https://cdn.example.test/maria-2.webp", "GALLERY", 0],
      ["https://cdn.example.test/maria-new.webp", "WORKSHOP", 1],
    ]);
    expect(await prisma.artisanImage.count({ where: { id: "h_aimg_1" } })).toBe(0);
  });

  it("PUT gallery is atomic: an invalid image is rejected and nothing (profile or images) changes", async () => {
    await signInAs(F.admin.super);
    const r = await putRoute(F.artisan.maria, { tagline: "SHOULD NOT SAVE", images: [{ url: "https://cdn.example.test/ok.webp" }, { caption: "no url" }] });
    expect(r.status).toBe(400);
    const g = await getRoute(F.artisan.maria);
    expect(g.body.artisan.tagline).toBe("Weaver");
    expect(g.body.artisan.images.map((i: { id: string }) => i.id)).toEqual(["h_aimg_1", "h_aimg_2"]);
  });

  it("PUT: slug is locked once ACTIVE, editable while DRAFT", async () => {
    await signInAs(F.admin.super);
    await putRoute(F.artisan.maria, { slug: "maria-renamed" });
    expect((await getRoute(F.artisan.maria)).body.artisan.slug).toBe("maria");
    // Even when unpublishing in the same save, the published slug stays.
    await putRoute(F.artisan.maria, { slug: "maria-renamed", status: "DRAFT" });
    const m = (await getRoute(F.artisan.maria)).body.artisan;
    expect([m.slug, m.status]).toEqual(["maria", "DRAFT"]);

    await putRoute(F.artisan.jose, { slug: "jose-potter" });
    expect((await getRoute(F.artisan.jose)).body.artisan.slug).toBe("jose-potter");

    // A DRAFT renamed onto another artisan's slug → 409, not a unique-index 500.
    const clash = await putRoute(F.artisan.jose, { slug: "maria", tagline: "nope" });
    expect(clash.status).toBe(409);
    expect((await getRoute(F.artisan.jose)).body.artisan).toMatchObject({ slug: "jose-potter", tagline: null });
  });

  it("PUT unknown id / other store's id → 404, nothing written", async () => {
    await signInAs(F.admin.super);
    expect((await putRoute("nope", { name: "x" })).status).toBe(404);
    expect((await putRoute(F.artisan.other, { name: "Hijacked" })).status).toBe(404);
    expect((await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.other } })).name).toBe("Olga Other");
  });

  it("DELETE: removes artisan, images and product links (product stays); unknown → 404", async () => {
    await signInAs(F.admin.super);
    const r = await delRoute(F.artisan.maria);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect((await getRoute(F.artisan.maria)).status).toBe(404);
    expect(await prisma.artisanImage.count({ where: { artisanId: F.artisan.maria } })).toBe(0);
    expect(await prisma.productArtisan.count({ where: { artisanId: F.artisan.maria } })).toBe(0);
    expect(await prisma.product.count({ where: { id: F.prod.hammock } })).toBe(1);

    expect((await delRoute(F.artisan.maria)).status).toBe(404);
    expect((await delRoute(F.artisan.other)).status).toBe(404);
    expect(await prisma.artisan.count({ where: { id: F.artisan.other } })).toBe(1);
  });
});

describe("artisans MCP tools", () => {
  it("registered for the house store only", async () => {
    const house = await connectMcp(KEYS.houseAdmin);
    const names = await house.toolNames();
    for (const t of ["artisans_list", "artisans_get", "artisans_create", "artisans_update", "artisans_delete"]) expect(names).toContain(t);
    await house.close();
    const other = await connectMcp(KEYS.otherAdmin);
    expect((await other.toolNames()).filter((n) => n.startsWith("artisans_"))).toEqual([]);
    const r = (await other.raw("artisans_get", { artisanId: F.artisan.other })) as { isError?: boolean };
    expect(r.isError).toBe(true);
    await other.close();
  });

  it("artisans_list: seeded house data, no secrets", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const r = await mcp.call("artisans_list");
    expectNoIgSecrets(r);
    expect(r.artisans.map((a: { id: string }) => a.id)).toEqual([F.artisan.maria, F.artisan.jose]);
    expect(r.artisans[0]).toMatchObject({ slug: "maria", status: "ACTIVE", region: "Sonsonate", isFeatured: true, productCount: 1, firstImageUrl: "https://cdn.example.test/maria-1.webp" });
    await mcp.close();
  });

  it("artisans_get: full profile without Instagram fields; unknown/other store → 404", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const a = await mcpGet(mcp, F.artisan.maria);
    expect(a).toMatchObject({ id: F.artisan.maria, craft: "Hammocks", practicingSince: 1998 });
    for (const k of IG_KEYS) expect(a).not.toHaveProperty(k);
    expect(a.images).toHaveLength(2);
    expect(await mcp.call("artisans_get", { artisanId: "nope" })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("artisans_get", { artisanId: F.artisan.other })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("artisans_create: preview (no row) → confirm → replay blocked → read back", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "artisans_create", { name: "Luis Ortega", craft: "Woodwork", status: "ACTIVE", practicingSince: 2010 }, async (p) => {
      expect(p.preview).toMatchObject({ slug: "luis-ortega", status: "ACTIVE", publishes: true, publicUrl: "/artisans/luis-ortega" });
      expect(await prisma.artisan.count({ where: { slug: "luis-ortega" } })).toBe(0);
    });
    const result = expectConfirmed(flow);
    expectNoIgSecrets(flow);
    expectReplayBlocked(flow);
    expect(await prisma.artisan.count({ where: { slug: "luis-ortega" } })).toBe(1);
    const a = await mcpGet(mcp, result.artisan.id);
    expect(a).toMatchObject({ name: "Luis Ortega", craft: "Woodwork", status: "ACTIVE", practicingSince: 2010 });
    // slug clash is caught at preview time
    expect(await mcp.call("artisans_create", { name: "Maria", slug: "maria" })).toMatchObject({ blocked: true, status: 409 });
    await mcp.close();
  });

  it("artisans_update: partial patch preserves every untouched field", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const before = await mcpGet(mcp, F.artisan.maria);
    const flow = await previewConfirmReplay(mcp, "artisans_update", { artisanId: F.artisan.maria, tagline: "Master weaver", slug: "new-slug" }, async (p) => {
      expect(Object.keys(p.preview.changes)).toEqual(["tagline"]);
      expect(p.preview.changes.tagline).toEqual({ before: "Weaver", after: "Master weaver" });
      expect(p.preview).toMatchObject({ slugLocked: true, images: "unchanged" });
      expect(p.preview.slugNote).toContain("locked");
      expect((await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.maria } })).tagline).toBe("Weaver");
    });
    expectConfirmed(flow);
    expectNoIgSecrets(flow);
    expectReplayBlocked(flow);
    const after = await mcpGet(mcp, F.artisan.maria);
    const omit = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "tagline" && k !== "updatedAt"));
    expect(after.tagline).toBe("Master weaver");
    expect(omit(after)).toEqual(omit(before)); // incl. slug, region, practicingSince, featuredPosts, socialEmbedCode, images
    expect((await prisma.artisan.findUniqueOrThrow({ where: { id: F.artisan.maria } })).igAccessToken).toBe(SECRET);
    await mcp.close();
  });

  it("artisans_update: images replace the whole gallery", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const images = [{ url: "https://cdn.example.test/a.webp", category: "PROCESS" }, { url: "https://cdn.example.test/b.webp" }];
    const flow = await previewConfirmReplay(mcp, "artisans_update", { artisanId: F.artisan.maria, images }, async (p) => {
      expect(p.preview.images).toEqual({ action: "replace all", deleting: 2, creating: 2 });
      expect(await prisma.artisanImage.count({ where: { artisanId: F.artisan.maria } })).toBe(2);
    });
    expectConfirmed(flow);
    expectReplayBlocked(flow);
    const a = await mcpGet(mcp, F.artisan.maria);
    expect(a.images.map((i: { url: string; category: string }) => [i.url, i.category])).toEqual([
      ["https://cdn.example.test/a.webp", "PROCESS"],
      ["https://cdn.example.test/b.webp", "GALLERY"],
    ]);
    expect(a.region).toBe("Sonsonate");
    // unknown artisan; slug clash caught at preview
    expect(await mcp.call("artisans_update", { artisanId: "nope", tagline: "x" })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("artisans_update", { artisanId: F.artisan.jose, slug: "maria" })).toMatchObject({ blocked: true, status: 409 });
    await mcp.close();
  });

  it("artisans_delete: preview (no change) → confirm → replay blocked → gone", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "artisans_delete", { artisanId: F.artisan.maria }, async (p) => {
      expect(p.preview).toMatchObject({ artisan: { id: F.artisan.maria, slug: "maria" }, alsoDeleted: { images: 2, productLinks: 1 } });
      expect(await prisma.artisan.count({ where: { id: F.artisan.maria } })).toBe(1);
    });
    expect(expectConfirmed(flow)).toEqual({ ok: true });
    expectReplayBlocked(flow);
    expect(await mcp.call("artisans_get", { artisanId: F.artisan.maria })).toMatchObject({ blocked: true, status: 404 });
    expect(await mcp.call("artisans_delete", { artisanId: F.artisan.other })).toMatchObject({ blocked: true, status: 404 });
    expect(await prisma.artisan.count({ where: { id: F.artisan.other } })).toBe(1);
    await mcp.close();
  });
});
