/**
 * Knowledge base: /api/admin/kb/articles (GET), /api/admin/kb/articles/[slug] (GET/PUT)
 * and kb_articles_list / kb_articles_get / kb_articles_update. Raw pg queries
 * scoped by tenantId (src/lib/admin-services/kb.ts). The OTHER store has an
 * article with the same slug "getting-started"; it must never reach the house.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { F, KEYS, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked } from "../helpers/mcp";
import * as listRoute from "@/app/api/admin/kb/articles/route";
import * as slugRoute from "@/app/api/admin/kb/articles/[slug]/route";

const OTHER_TITLE = "Other Store Secret Doc";

const listKb = (query?: Record<string, string>) => call(listRoute.GET as never, "GET", "/api/admin/kb/articles", { query });
const getKb = (slug: string) => call(slugRoute.GET as never, "GET", `/api/admin/kb/articles/${slug}`, { params: { slug } });
const putKb = (slug: string, body: unknown) => call(slugRoute.PUT as never, "PUT", `/api/admin/kb/articles/${slug}`, { params: { slug }, body });

async function otherArticleUnchanged() {
  const o = await prisma.kBArticle.findUniqueOrThrow({ where: { id: F.kb.other } });
  expect(o).toMatchObject({ tenantId: OTHER, slug: "getting-started", title: OTHER_TITLE, content: "other tenant only", excerpt: "x" });
}

describe("KB routes: auth", () => {
  const cases: [string, () => Promise<{ status: number }>][] = [
    ["GET list", () => listKb()],
    ["GET one", () => getKb("getting-started")],
    ["PUT", () => putKb("getting-started", { title: "Pwned", category: "x", excerpt: "x", content: "x", readTimeMin: 1 })],
  ];
  for (const [name, run] of cases) {
    it(`${name}: no session → 401; other store → 403`, async () => {
      expect((await run()).status).toBe(401);
      await signInAs(F.admin.oSuper);
      const r = await run();
      expect(r.status).toBe(403);
      expect(JSON.stringify(r)).not.toContain(OTHER_TITLE); // not even its own article: KB is house-only
      await otherArticleUnchanged();
      expect((await prisma.kBArticle.findUniqueOrThrow({ where: { id: F.kb.gettingStarted } })).title).toBe("Getting Started");
    });
  }
});

describe("KB routes", () => {
  it("GET list: house articles + categories only, no content", async () => {
    await signInAs(F.admin.super);
    const r = await listKb();
    expect(r.status).toBe(200);
    expect(r.body.articles.map((a: { slug: string }) => a.slug).sort()).toEqual(["getting-started", "shipping-basics"]);
    expect(r.body.categories).toEqual(["Basics", "Shipping"]);
    expect(r.body.articles[0]).not.toHaveProperty("content");
    expect(r.text).not.toContain(OTHER_TITLE);
    expect(r.text).not.toContain("other tenant only");
  });

  it("GET list: search (title/excerpt/content with snippet) and category filter", async () => {
    await signInAs(F.admin.super);
    const byExcerpt = await listKb({ search: "rates" });
    expect(byExcerpt.body.articles.map((a: { slug: string }) => a.slug)).toEqual(["shipping-basics"]);
    expect(byExcerpt.body.articles[0].matchSnippet).toBeNull();

    const byContent = await listKb({ search: "admin works" });
    expect(byContent.body.articles.map((a: { slug: string }) => a.slug)).toEqual(["getting-started"]);
    expect(byContent.body.articles[0].matchSnippet).toContain("admin works");

    // A term only in the other store's article finds nothing.
    expect((await listKb({ search: "other tenant" })).body.articles).toEqual([]);

    const cat = await listKb({ category: "Shipping" });
    expect(cat.body.articles.map((a: { slug: string }) => a.slug)).toEqual(["shipping-basics"]);
    expect((await listKb({ category: "All" })).body.articles).toHaveLength(2);
  });

  it("GET one: the house article for a slug the other store also uses; unknown → 404", async () => {
    await signInAs(F.admin.super);
    const r = await getKb("getting-started");
    expect(r.status).toBe(200);
    expect(r.body.article).toMatchObject({ id: F.kb.gettingStarted, title: "Getting Started", content: "# Welcome\nHow the admin works." });
    expect(r.text).not.toContain(OTHER_TITLE);
    expect((await getKb("nope")).status).toBe(404);
  });

  it("PUT with the admin editor's full body updates only the house article", async () => {
    await signInAs(F.admin.super);
    const body = { title: "Getting Started v2", category: "Basics", excerpt: "Start here!", content: "# New\nUpdated.", readTimeMin: 5 };
    const r = await putKb("getting-started", body);
    expect(r.status).toBe(200);
    expect(r.body.article).toMatchObject({ id: F.kb.gettingStarted, ...body });
    const g = await getKb("getting-started");
    expect(g.body.article).toMatchObject(body);
    await otherArticleUnchanged();
  });

  it("PUT with a partial body keeps the other fields (no NOT NULL 500)", async () => {
    await signInAs(F.admin.super);
    const r = await putKb("shipping-basics", { title: "Shipping 101" });
    expect(r.status).toBe(200);
    const g = await getKb("shipping-basics");
    expect(g.body.article).toMatchObject({ title: "Shipping 101", category: "Shipping", excerpt: "Zones and rates", content: "Zones then rates.", readTimeMin: 3 });
  });

  it("PUT with invalid field types → 400, nothing written", async () => {
    await signInAs(F.admin.super);
    expect((await putKb("shipping-basics", { readTimeMin: "abc" })).status).toBe(400);
    expect((await putKb("shipping-basics", { readTimeMin: 0 })).status).toBe(400);
    expect((await putKb("shipping-basics", { title: 42 })).status).toBe(400);
    expect((await getKb("shipping-basics")).body.article).toMatchObject({ title: "Shipping Basics", readTimeMin: 3 });
  });

  it("PUT unknown slug → 404", async () => {
    await signInAs(F.admin.super);
    expect((await putKb("nope", { title: "x", category: "x", excerpt: "x", content: "x", readTimeMin: 1 })).status).toBe(404);
  });
});

describe("KB MCP tools", () => {
  it("house only: not registered for the other store", async () => {
    const other = await connectMcp(KEYS.otherAdmin);
    expect((await other.toolNames()).filter((n) => n.startsWith("kb_"))).toEqual([]);
    const r = (await other.raw("kb_articles_get", { slug: "getting-started" })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).not.toContain("other tenant only");
    await other.close();
  });

  it("kb_articles_list / kb_articles_get: house data only", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const l = await mcp.call("kb_articles_list");
    expect(l.articles.map((a: { slug: string }) => a.slug).sort()).toEqual(["getting-started", "shipping-basics"]);
    expect(l.categories).toEqual(["Basics", "Shipping"]);
    expect(JSON.stringify(l)).not.toContain(OTHER_TITLE);
    const s = await mcp.call("kb_articles_list", { search: "admin works", category: "Basics" });
    expect(s.articles).toHaveLength(1);
    expect(s.articles[0].matchSnippet).toContain("admin works");

    const g = await mcp.call("kb_articles_get", { slug: "getting-started" });
    expect(g.article).toMatchObject({ id: F.kb.gettingStarted, title: "Getting Started" });
    expect(JSON.stringify(g)).not.toContain(OTHER_TITLE);
    expect(await mcp.call("kb_articles_get", { slug: "nope" })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });

  it("kb_articles_update: preview (no change) → confirm → replay blocked → read back; other store untouched", async () => {
    const mcp = await connectMcp(KEYS.houseAdmin);
    const flow = await previewConfirmReplay(mcp, "kb_articles_update", { slug: "getting-started", title: "Welcome!", content: "Brand new content" }, async (p) => {
      expect(p.preview.changes.title).toEqual({ before: "Getting Started", after: "Welcome!" });
      expect(p.preview.changes.content).toEqual({ before: "30 chars", after: "17 chars" });
      expect(p.preview.changes).not.toHaveProperty("category");
      expect((await prisma.kBArticle.findUniqueOrThrow({ where: { id: F.kb.gettingStarted } })).title).toBe("Getting Started");
    });
    expect(expectConfirmed(flow).article).toMatchObject({ id: F.kb.gettingStarted, title: "Welcome!" });
    expectReplayBlocked(flow);
    const g = await mcp.call("kb_articles_get", { slug: "getting-started" });
    expect(g.article).toMatchObject({ title: "Welcome!", content: "Brand new content", category: "Basics", excerpt: "Start here", readTimeMin: 3 });
    await otherArticleUnchanged();
    expect(await mcp.call("kb_articles_update", { slug: "nope", title: "x" })).toMatchObject({ blocked: true, status: 404 });
    await mcp.close();
  });
});
