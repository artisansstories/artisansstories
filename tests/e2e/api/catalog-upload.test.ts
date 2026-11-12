/* eslint-disable @typescript-eslint/no-explicit-any -- JSON payloads from routes/MCP */
/**
 * Catalog e2e — product image upload: POST /api/admin/upload (multipart) and the
 * products_upload_image MCP tool. sharp runs for real; R2 is the in-memory fake.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { F, KEYS, HOUSE, OTHER } from "../seed";
import { call } from "../helpers/route";
import { signInAs } from "../helpers/session";
import { connectMcp, previewConfirmReplay, expectConfirmed, expectReplayBlocked, type Mcp } from "../helpers/mcp";
import { s3State, fetchState, PNG_1PX, FakeS3Client } from "../helpers/fakes";
import * as uploadRoute from "@/app/api/admin/upload/route";

type H = never;

afterEach(() => {
  vi.restoreAllMocks();
});

async function withMcp<T>(key: string, fn: (mcp: Mcp) => Promise<T>): Promise<T> {
  const mcp = await connectMcp(key);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}

function form(file: Blob | string | null, name = "photo.png", extra: Record<string, string> = {}) {
  const fd = new FormData();
  if (file !== null) {
    if (typeof file === "string") fd.set("file", file);
    else fd.set("file", file, name);
  }
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}
const png = () => new File([new Uint8Array(PNG_1PX)], "photo.png", { type: "image/png" });

/** The three webp variants of one upload, under the tenant prefix. */
function expectWebpVariants(tenantId: string, body: any) {
  expect(s3State.puts).toHaveLength(3);
  const keys = s3State.puts.map((p) => p.Key).sort();
  const base = body.url.replace("https://r2.e2e.test/", "").replace(/\.webp$/, "");
  expect(base).toMatch(new RegExp(`^tenants/${tenantId}/products/\\d+-[a-z0-9]+$`));
  expect(keys).toEqual([`${base}-medium.webp`, `${base}-thumb.webp`, `${base}.webp`].sort());
  for (const p of s3State.puts) {
    expect(p.ContentType).toBe("image/webp");
    expect(p.size).toBeGreaterThan(0);
  }
  expect(body).toMatchObject({
    url: `https://r2.e2e.test/${base}.webp`,
    urlMedium: `https://r2.e2e.test/${base}-medium.webp`,
    urlThumb: `https://r2.e2e.test/${base}-thumb.webp`,
    width: 1,
    height: 1,
    size: PNG_1PX.length,
    // No OpenRouter key in the suite: the fallback alt text, never a failed upload.
    altTextSource: "fallback",
  });
  expect(body.altText).toMatch(/ image$/);
}

describe("POST /api/admin/upload", () => {
  it("401 without a session; nothing stored", async () => {
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png()) });
    expect(r.status).toBe(401);
    expect(s3State.puts).toHaveLength(0);
  });

  it("real PNG → three webp variants under the session's tenant prefix", async () => {
    await signInAs(F.admin.super);
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png(), "photo.png", { productName: "Hammock" }) });
    expect(r.status, r.text).toBe(200);
    expectWebpVariants(HOUSE, r.body);
  });

  it("another store's admin writes under that store's prefix", async () => {
    await signInAs(F.admin.oSuper);
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png()) });
    expect(r.status, r.text).toBe(200);
    expectWebpVariants(OTHER, r.body);
  });

  it("wrong type, missing file, oversize and undecodable images are 400; nothing stored", async () => {
    await signInAs(F.admin.super);
    const wrongType = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(new File(["hello"], "notes.txt", { type: "text/plain" }), "notes.txt") });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error).toMatch(/Invalid file type/);
    const gif = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(new File([new Uint8Array(PNG_1PX)], "a.gif", { type: "image/gif" }), "a.gif") });
    expect(gif.status).toBe(400);
    const none = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(null) });
    expect(none.status).toBe(400);
    expect(none.body).toEqual({ error: "No file provided" });
    const str = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form("just a string") });
    expect(str.status).toBe(400);
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const tooBig = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(big, "big.png") });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/too large/);
    const garbage = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(new File(["definitely not a png"], "x.png", { type: "image/png" }), "x.png") });
    expect(garbage.status, garbage.text).toBe(400);
    expect(s3State.puts).toHaveLength(0);
  });

  it("a failed R2 write is reported as an error, not a success with dead URLs", async () => {
    await signInAs(F.admin.super);
    vi.spyOn(FakeS3Client.prototype, "send").mockRejectedValueOnce(new Error("R2 is down"));
    const r = await call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png()) });
    expect(r.status, r.text).toBeGreaterThanOrEqual(500);
    expect(r.body.error).toEqual(expect.any(String));
    expect(r.body.url).toBeUndefined();
  });
});

describe("MCP products_upload_image", () => {
  it("preview fetches/stores nothing; confirm stores webp variants under the key's tenant; replay blocked", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const args = { imageUrl: "https://images.example.test/hammock.png", productName: "Hammock" };
      const flow = await previewConfirmReplay(mcp, "products_upload_image", args, (preview) => {
        expect(s3State.puts).toHaveLength(0);
        expect(fetchState.served).toHaveLength(0);
        expect(preview.preview).toMatchObject({ imageUrl: args.imageUrl, attachesToProduct: false });
      });
      const result = expectConfirmed(flow);
      expectReplayBlocked(flow);
      expect(fetchState.served).toEqual([args.imageUrl]);
      expectWebpVariants(HOUSE, result);
    });
  });

  it("another store's key writes under that store's prefix", async () => {
    await withMcp(KEYS.otherAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "products_upload_image", { imageUrl: "https://images.example.test/glove.png" });
      expectWebpVariants(OTHER, expectConfirmed(flow));
    });
  });

  it("private hosts and non-https URLs are refused before any fetch", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const priv = await mcp.call("products_upload_image", { imageUrl: "https://private.example.test/x.png" });
      expect(priv).toMatchObject({ done: false, blocked: true, status: 400 });
      expect(priv.reason).toMatch(/not public/);
      const http = await mcp.call("products_upload_image", { imageUrl: "http://images.example.test/x.png" });
      expect(http).toMatchObject({ blocked: true, status: 400 });
      const local = await mcp.call("products_upload_image", { imageUrl: "https://127.0.0.1/x.png" });
      expect(local).toMatchObject({ blocked: true, status: 400 });
      expect(fetchState.served).toHaveLength(0);
      expect(fetchState.blocked).toHaveLength(0);
      expect(s3State.puts).toHaveLength(0);
    });
  });

  it("a 404 image is reported as a failure and stores nothing", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      const flow = await previewConfirmReplay(mcp, "products_upload_image", { imageUrl: "https://images.example.test/missing.png" });
      expect(flow.confirmed).toMatchObject({ done: false, blocked: true, status: 400, outcome: "failed" });
      expect(flow.confirmed.reason).toMatch(/404/);
      expectReplayBlocked(flow);
      expect(s3State.puts).toHaveLength(0);
    });
  });

  it("a failed R2 write is reported as a failure", async () => {
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      vi.spyOn(FakeS3Client.prototype, "send").mockRejectedValueOnce(new Error("R2 is down"));
      const flow = await previewConfirmReplay(mcp, "products_upload_image", { imageUrl: "https://images.example.test/a.png" });
      expect(flow.confirmed.done, JSON.stringify(flow.confirmed)).toBe(false);
      expect(flow.confirmed.blocked).toBe(true);
      expect(flow.confirmed.status).toBeGreaterThanOrEqual(500);
    });
  });

  it("is not available to a read-only key", async () => {
    await withMcp(KEYS.houseRead, async (mcp) => {
      expect(await mcp.toolNames()).not.toContain("products_upload_image");
    });
  });
});

// ── alt text: OpenRouter never blocks an upload or a save ───────────────────

describe("product image alt text (OpenRouter) never blocks, falls back, and can be regenerated", () => {
  const prisma = async () => (await import("@/lib/prisma")).prisma;
  const upload = (extra: Record<string, string>) => call(uploadRoute.POST as H, "POST", "/api/admin/upload", { formData: form(png(), "photo.png", extra) });
  function withKey() {
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-e2e-dummy";
    return () => {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    };
  }

  it("key missing: upload succeeds with '<product> — image <n>' and a warning; no call leaves the machine", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await signInAs(F.admin.super);
    const r = await upload({ productName: "Woven Hammock", position: "2" });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ altText: "Woven Hammock — image 2", altTextSource: "fallback" });
    expect(warn.mock.calls.flat().join(" ")).toContain("OPENROUTER_API_KEY is not set");
    expect(fetchState.blocked).toHaveLength(0);
    expect(s3State.puts).toHaveLength(3);
  });

  it("OpenRouter erroring, or unreachable: upload still succeeds with the fallback", async () => {
    const restore = withKey();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await signInAs(F.admin.super);
      fetchState.openrouter = "error";
      const a = await upload({ productName: "Clay Mug", position: "1" });
      expect(a.status).toBe(200);
      expect(a.body).toMatchObject({ altText: "Clay Mug — image 1", altTextSource: "fallback" });
      fetchState.openrouter = null; // the guard now refuses the host, like a network failure
      const b = await upload({ productName: "Clay Mug" });
      expect(b.status).toBe(200);
      expect(b.body).toMatchObject({ altText: "Clay Mug image", altTextSource: "fallback" });
      expect(warn.mock.calls.flat().join(" ")).toMatch(/OpenRouter returned 503[\s\S]*OpenRouter call failed/);
    } finally {
      restore();
    }
  });

  it("OpenRouter hanging: the call times out and the upload completes with the fallback", async () => {
    const restore = withKey();
    process.env.ALT_TEXT_TIMEOUT_MS = "100";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await signInAs(F.admin.super);
      fetchState.openrouter = "hang";
      const started = Date.now();
      const r = await upload({ productName: "Woven Hammock", position: "3" });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ altText: "Woven Hammock — image 3", altTextSource: "fallback" });
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      delete process.env.ALT_TEXT_TIMEOUT_MS;
      restore();
    }
  });

  it("OpenRouter working: the AI alt text is used (source ai)", async () => {
    const restore = withKey();
    try {
      await signInAs(F.admin.super);
      fetchState.openrouter = "ok";
      const r = await upload({ productName: "Woven Hammock" });
      expect(r.body).toMatchObject({ altText: "Hand-woven blue cotton hammock with fringed edges", altTextSource: "ai" });
    } finally {
      restore();
    }
  });

  it("product save: images without alt text get '<name> — image <n>' (route + MCP)", async () => {
    const productsRoute = await import("@/app/api/admin/products/route");
    const productIdRoute = await import("@/app/api/admin/products/[id]/route");
    await signInAs(F.admin.super);
    const created = await call(productsRoute.POST as H, "POST", "/api/admin/products", {
      body: { name: "Basket", price: 2000, images: [{ url: "https://images.example.test/a.png" }, { url: "https://images.example.test/b.png", altText: "  " }, { url: "https://images.example.test/c.png", altText: "Mine" }] },
    });
    expect(created.status, created.text).toBe(201);
    const id = created.body.product?.id ?? created.body.id;
    const rows = async () => (await (await prisma()).productImage.findMany({ where: { productId: id }, orderBy: { position: "asc" } })).map((i) => i.altText);
    expect(await rows()).toEqual(["Basket — image 1", "Basket — image 2", "Mine"]);
    const upd = await call(productIdRoute.PUT as H, "PUT", `/api/admin/products/${id}`, { params: { id }, body: { name: "Big Basket", images: [{ url: "https://images.example.test/a.png" }] } });
    expect(upd.status, upd.text).toBe(200);
    expect(await rows()).toEqual(["Big Basket — image 1"]);
    await withMcp(KEYS.houseAdmin, async (mcp) => {
      expectConfirmed(await previewConfirmReplay(mcp, "products_update", { productId: id, images: [{ url: "https://images.example.test/z.png" }, { url: "https://images.example.test/y.png" }] }));
    });
    expect(await rows()).toEqual(["Big Basket — image 1", "Big Basket — image 2"]);
  });

  it("regenerate later: route and MCP replace fallback alt text when the AI is back; keep it when it isn't", async () => {
    const altRoute = await import("@/app/api/admin/products/[id]/alt-text/route");
    const db = await prisma();
    await db.productImage.updateMany({ where: { productId: F.prod.hammock }, data: { url: "https://images.example.test/h.png", urlThumb: null } });
    await db.productImage.update({ where: { id: "h_pimg_1" }, data: { altText: "Woven Hammock — image 1" } });
    await db.productImage.update({ where: { id: "h_pimg_2" }, data: { altText: "A red hammock, typed by hand" } });
    await signInAs(F.admin.super);
    const regen = () => call(altRoute.POST as H, "POST", `/api/admin/products/${F.prod.hammock}/alt-text`, { params: { id: F.prod.hammock }, body: {} });

    // AI unavailable (no key): 200, nothing breaks, the fallback stays, the note says why.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const off = await regen();
    expect(off.status, off.text).toBe(200);
    expect(off.body).toMatchObject({ regenerated: 0, images: [{ id: "h_pimg_1", altText: "Woven Hammock — image 1", source: "unchanged" }] });
    expect(off.body.note).toMatch(/AI wasn't available/);

    const restore = withKey();
    try {
      fetchState.openrouter = "ok";
      const on = await regen();
      expect(on.body).toMatchObject({ regenerated: 1, images: [{ id: "h_pimg_1", altText: "Hand-woven blue cotton hammock with fringed edges", source: "ai" }] });
      const rows = await db.productImage.findMany({ where: { productId: F.prod.hammock }, orderBy: { position: "asc" } });
      expect(rows.map((r) => r.altText)).toEqual(["Hand-woven blue cotton hammock with fringed edges", "A red hammock, typed by hand"]);

      await withMcp(KEYS.houseAdmin, async (mcp) => {
        const nothing = await mcp.call("products_regenerate_alt_text", { productId: F.prod.hammock });
        expect(nothing.preview).toMatchObject({ images: [], aiConfigured: true });
        const flow = await previewConfirmReplay(mcp, "products_regenerate_alt_text", { productId: F.prod.hammock, all: true }, (pv) => {
          expect(pv.preview.images.map((i: any) => i.id)).toEqual(["h_pimg_1", "h_pimg_2"]);
        });
        expect(expectConfirmed(flow)).toMatchObject({ regenerated: 2 });
        expectReplayBlocked(flow);
      });
    } finally {
      restore();
    }
  });
});
